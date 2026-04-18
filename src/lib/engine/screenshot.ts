/**
 * Screenshot capture for the Siderea canvas.
 *
 * Captures the current canvas frame as a PNG and triggers a download.
 * Optionally hides UI overlays during capture.
 */

/** Generate a filename based on current target and timestamp. */
function generateFilename(targetName: string | null): string {
	const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const prefix = targetName
		? targetName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
		: 'siderea';
	return `${prefix}-${date}.png`;
}

/**
 * Capture the canvas and download as PNG.
 *
 * The renderer must have `preserveDrawingBuffer: true` OR the capture must
 * happen inside the render loop. We use toBlob from the canvas directly —
 * the caller should ensure the canvas has just been rendered.
 *
 * @param canvas The WebGPU/WebGL canvas element.
 * @param targetName Optional current target name for the filename.
 * @returns Promise that resolves when download is triggered.
 */
export async function captureScreenshot(
	canvas: HTMLCanvasElement,
	targetName: string | null
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error('Failed to capture canvas'));
					return;
				}
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = generateFilename(targetName);
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				resolve();
			},
			'image/png'
		);
	});
}
