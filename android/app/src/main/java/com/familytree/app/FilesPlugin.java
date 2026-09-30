package com.familytree.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.IntentCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import org.json.JSONException;

/**
 * Opening and saving files, robust against Android killing the app while a system file dialog
 * is open.
 *
 * Dialog results are received natively by launchers registered on every activity start, so
 * they also arrive in a freshly restarted process. A chosen document is copied into the cache
 * right away. Files handed over by other apps ("Open with", "Share") take the same path (see
 * MainActivity). When no JavaScript call is waiting any more, the file is kept as "pending" and
 * the web app picks it up with takePending() on start or on the pendingFile event.
 */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

    private static final String TAG = "Files";
    private static final String PREFS = "file_open";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_PURPOSE = "purpose";
    private static final String KEY_SAVE_SOURCE = "saveSource";
    private static final long MAX_AGE_MS = 24L * 60 * 60 * 1000;

    private static FilesPlugin instance;

    private ActivityResultLauncher<String[]> openLauncher;
    private ActivityResultLauncher<Intent> saveLauncher;
    /** The JS calls waiting for a dialog; lost if the process is killed meanwhile. */
    private PluginCall pickCall;
    private PluginCall saveCall;

    @Override
    public void load() {
        instance = this;
        openLauncher = getActivity().registerForActivityResult(new ActivityResultContracts.OpenDocument(), this::onPicked);
        saveLauncher = getActivity().registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r ->
            onSaveTarget(r.getData() != null ? r.getData().getData() : null)
        );
    }

    // ---------------- open ----------------

    /** pick({ types: string[], purpose: 'open' | 'attach' }) → { name, path, mimeType } or { cancelled: true } */
    @PluginMethod
    public void pick(PluginCall call) {
        String[] types = { "*/*" };
        JSArray arr = call.getArray("types");
        try {
            if (arr != null && arr.length() > 0) types = arr.toList().toArray(new String[0]);
        } catch (JSONException ignored) {}
        prefs(getContext()).edit().putString(KEY_PURPOSE, call.getString("purpose", "open")).apply();
        pickCall = call;
        openLauncher.launch(types);
    }

    /** Returns (and forgets) a file that arrived while no call was waiting: { file } or { file: null }. */
    @PluginMethod
    public void takePending(PluginCall call) {
        SharedPreferences prefs = prefs(getContext());
        String json = prefs.getString(KEY_PENDING, null);
        prefs.edit().remove(KEY_PENDING).apply();
        JSObject result = new JSObject();
        try {
            result.put("file", json != null ? new JSObject(json) : null);
        } catch (JSONException e) {
            result.put("file", null);
        }
        call.resolve(result);
    }

    private void onPicked(Uri uri) {
        Context ctx = getContext();
        SharedPreferences prefs = prefs(ctx);
        String purpose = prefs.getString(KEY_PURPOSE, "open");
        prefs.edit().remove(KEY_PURPOSE).apply();
        PluginCall call = pickCall;
        pickCall = null;

        if (uri == null) {
            if (call != null) {
                JSObject r = new JSObject();
                r.put("cancelled", true);
                call.resolve(r);
            }
            return;
        }
        JSObject file = importUri(ctx, uri);
        if (call != null) {
            if (file.has("error")) call.reject(file.getString("error"));
            else call.resolve(file);
        } else if ("open".equals(purpose)) {
            // the app was restarted while the chooser was open: hand the file over as pending
            deliver(ctx, file);
        }
    }

    /** Called by MainActivity for VIEW ("Open with") and SEND ("Share") intents. */
    static void handleIntent(Context ctx, Intent intent) {
        if (intent == null) return;
        // reopening the app from Recents replays the intent that once started it: not a new file
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) uri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
        if (uri == null) return;
        deliver(ctx, importUri(ctx, uri));
    }

    private static void deliver(Context ctx, JSObject file) {
        prefs(ctx).edit().putString(KEY_PENDING, file.toString()).apply();
        if (instance != null) instance.notifyListeners("pendingFile", new JSObject(), true);
    }

    /** Copies the document into the cache; returns { name, path, mimeType } or { error }. */
    private static JSObject importUri(Context ctx, Uri uri) {
        JSObject r = new JSObject();
        try {
            File dir = new File(ctx.getCacheDir(), "opened");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("cache is not writable");
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > MAX_AGE_MS) f.delete();

            String name = displayName(ctx, uri);
            File out = new File(dir, "f" + System.currentTimeMillis() + extension(name));
            try (InputStream in = ctx.getContentResolver().openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
                if (in == null) throw new IOException("no data");
                copy(in, os);
            }
            r.put("name", name);
            r.put("path", out.getAbsolutePath());
            r.put("mimeType", ctx.getContentResolver().getType(uri));
        } catch (Exception e) {
            Logger.error(TAG, "Cannot read " + uri, e);
            r.put("error", e.getMessage() != null ? e.getMessage() : e.toString());
        }
        return r;
    }

    // ---------------- save ----------------

    /**
     * saveAs({ name, mimeType, path }) — system "Save as" dialog; the prepared file at `path`
     * is copied to the chosen place. → { saved: true } or { cancelled: true }
     */
    @PluginMethod
    public void saveAs(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        }
        // kept so the copy also happens if the app is restarted while the dialog is open
        prefs(getContext()).edit().putString(KEY_SAVE_SOURCE, path).apply();
        saveCall = call;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(call.getString("mimeType", "application/octet-stream"))
            .putExtra(Intent.EXTRA_TITLE, call.getString("name", "file"));
        saveLauncher.launch(intent);
    }

    private void onSaveTarget(Uri target) {
        Context ctx = getContext();
        SharedPreferences prefs = prefs(ctx);
        String source = prefs.getString(KEY_SAVE_SOURCE, null);
        prefs.edit().remove(KEY_SAVE_SOURCE).apply();
        PluginCall call = saveCall;
        saveCall = null;
        JSObject r = new JSObject();
        if (target == null || source == null) {
            r.put("cancelled", true);
            if (call != null) call.resolve(r);
            return;
        }
        try (InputStream in = new FileInputStream(source); OutputStream os = ctx.getContentResolver().openOutputStream(target, "wt")) {
            if (os == null) throw new IOException("the target is not writable");
            copy(in, os);
            r.put("saved", true);
            if (call != null) call.resolve(r);
        } catch (Exception e) {
            Logger.error(TAG, "Cannot write " + target, e);
            if (call != null) call.reject("Cannot save the file: " + e.getMessage());
        }
    }

    // ---------------- helpers ----------------

    private static void copy(InputStream in, OutputStream os) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
    }

    private static String displayName(Context ctx, Uri uri) {
        try (Cursor c = ctx.getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception ignored) {}
        String last = uri.getLastPathSegment();
        return last != null ? last.substring(last.lastIndexOf('/') + 1) : "file";
    }

    private static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot >= 0 && name.length() - dot <= 8 ? name.substring(dot) : "";
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
