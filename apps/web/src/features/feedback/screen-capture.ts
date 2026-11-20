import { fitImage } from './attachment-images.js';

const captureAttribute = 'data-feedback-capture';
const displayOptions = {
  video: { displaySurface: 'browser' },
  audio: false,
  preferCurrentTab: true,
  selfBrowserSurface: 'include',
  surfaceSwitching: 'exclude',
} as const;

function firstFrame(stream: MediaStream, signal: AbortSignal): Promise<HTMLCanvasElement> {
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState === 'ended') {
    throw new DOMException('', 'NotReadableError');
  }
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  return new Promise((resolve, reject) => {
    let settled = false;
    let delay: number | undefined;
    // 选择框关闭后，等遮挡样式完成绘制并进入捕获画面。
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        delay = window.setTimeout(() => void draw(), 120);
      });
    });
    const timeout = window.setTimeout(() => fail(new DOMException('', 'TimeoutError')), 5000);
    signal.addEventListener('abort', abort, { once: true });
    track.addEventListener('ended', end, { once: true });

    function finish() {
      if (settled) return false;
      settled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delay);
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      track.removeEventListener('ended', end);
      video.srcObject = null;
      return true;
    }

    function fail(error: unknown) {
      if (finish()) reject(error instanceof Error ? error : new Error('无法读取截图'));
    }

    function abort() {
      fail(new DOMException('', 'AbortError'));
    }

    function end() {
      fail(new DOMException('', 'NotReadableError'));
    }

    async function draw() {
      try {
        video.srcObject = stream;
        await video.play();
        if (settled) return;
        if (
          track.readyState === 'ended' ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          !video.videoWidth ||
          !video.videoHeight
        ) {
          end();
          return;
        }
        const canvas = document.createElement('canvas');
        const { width, height } = fitImage(video.videoWidth, video.videoHeight, 2560);
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new DOMException('', 'NotSupportedError');
        context.drawImage(video, 0, 0, width, height);
        if (finish()) resolve(canvas);
      } catch (error) {
        fail(error);
      }
    }
  });
}

/** 只能从触发截图的点击直接调用；浏览器选择框不接受 AbortSignal。 */
export async function captureFeedbackScreen(signal: AbortSignal): Promise<HTMLCanvasElement> {
  const root = document.documentElement;
  if (signal.aborted) throw new DOMException('', 'AbortError');
  if (root.hasAttribute(captureAttribute)) throw new DOMException('', 'InvalidStateError');
  const selection = navigator.mediaDevices.getDisplayMedia(displayOptions);
  root.setAttribute(captureAttribute, '');
  let stream: MediaStream | undefined;

  function stop() {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = undefined;
  }

  function abort() {
    stop();
    root.removeAttribute(captureAttribute);
  }

  signal.addEventListener('abort', abort, { once: true });
  try {
    stream = await selection;
    if (signal.aborted) throw new DOMException('', 'AbortError');
    return await firstFrame(stream, signal);
  } finally {
    stop();
    signal.removeEventListener('abort', abort);
    if (!signal.aborted) root.removeAttribute(captureAttribute);
  }
}
