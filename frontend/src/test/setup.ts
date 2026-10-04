/**
 * Test environment setup.
 *
 * Two jobs:
 *
 * 1. jsdom does not implement the modal part of the HTML dialog element: it
 *    knows the `<dialog>` tag and its `open` property, but not
 *    `showModal()`/`close()`. The shim below supplies exactly the missing
 *    platform API so `Dialog` can be exercised against a real `<dialog>`.
 *
 *    The component is not modified to work around this: every browser that
 *    matters supports `showModal`, so a production fallback would be dead
 *    weight.
 *
 * 2. This project runs Vitest with `globals: false`, so Testing Library cannot
 *    register its own automatic cleanup. Without `cleanup()` after each test,
 *    renders accumulate in `document.body` and queries match several elements.
 */

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// The DOM typings declare `showModal`/`close`; only jsdom is missing them at
// runtime, so the `typeof` guards below are a runtime capability check and need
// no type widening.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;

  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }

  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}

afterEach(() => {
  cleanup();
});