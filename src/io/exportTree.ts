import { toCanvas } from 'html-to-image';
import { useStore } from '../model/store';
import { treeCanvas } from '../tree/shared';
import { canvasToBlob, cssVar, saveExport } from './exportShared';
import { isAndroid } from './platform';

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

/** Renders the whole tree (not just the visible part) into a canvas. */
async function renderTree(): Promise<HTMLCanvasElement> {
  // the view normally renders only what is on screen: switch virtualization off for the capture
  useStore.setState({ exportAll: true });
  try {
    await nextFrame();
    await nextFrame();
    const world = treeCanvas.world;
    const { width, height } = treeCanvas;
    if (!world || !width) throw new Error('empty tree');
    // stay inside canvas limits: desktop Chromium ~16k px / 180 Mpx, phones have far less memory
    const [maxSide, maxArea] = isAndroid ? [8192, 32e6] : [16000, 180e6];
    const ratio = Math.min(2, maxSide / Math.max(width, height), Math.sqrt(maxArea / (width * height)));
    // html-to-image loses class-based SVG styling: bake the computed styles in for the capture
    const paths = [...world.querySelectorAll<SVGPathElement>('svg path')];
    const saved = paths.map((p) => p.getAttribute('style'));
    for (const p of paths) {
      const cs = getComputedStyle(p);
      p.setAttribute('style', `fill:none;stroke:${cs.stroke};stroke-width:${cs.strokeWidth};stroke-dasharray:${cs.strokeDasharray};stroke-linejoin:round;stroke-linecap:round`);
    }
    world.classList.add('exporting');
    try {
      return await toCanvas(world, {
        width,
        height,
        pixelRatio: ratio,
        backgroundColor: cssVar('--md-canvas') || '#ffffff',
        style: { transform: 'none', transition: 'none' },
      });
    } finally {
      world.classList.remove('exporting');
      paths.forEach((p, i) => (saved[i] == null ? p.removeAttribute('style') : p.setAttribute('style', saved[i]!)));
    }
  } finally {
    useStore.setState({ exportAll: false });
  }
}

export function exportTreeImage(kind: 'png' | 'pdf', baseName: string) {
  if (kind === 'png') return saveExport(baseName + '.png', { name: 'PNG', ext: 'png' }, async () => canvasToBlob(await renderTree(), 'image/png'));
  return saveExport(baseName + '.pdf', { name: 'PDF', ext: 'pdf' }, async () => {
    const canvas = await renderTree();
    const { jsPDF } = await import('jspdf');
    // one page with the image's aspect, capped to the PDF maximum page size (14400 pt)
    const { width, height } = treeCanvas;
    const scale = Math.min(1, 14000 / Math.max(width, height));
    const pw = width * scale * 0.75, ph = height * scale * 0.75;
    const pdf = new jsPDF({ orientation: pw > ph ? 'landscape' : 'portrait', unit: 'pt', format: [pw, ph], compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph);
    return pdf.output('blob');
  });
}
