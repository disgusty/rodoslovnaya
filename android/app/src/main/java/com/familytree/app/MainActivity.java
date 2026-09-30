package com.familytree.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(FilesPlugin.class);
        super.onCreate(savedInstanceState);
        // a file opened from another app; on re-creation it was handled already
        if (savedInstanceState == null) FilesPlugin.handleIntent(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        FilesPlugin.handleIntent(this, intent);
    }
}
