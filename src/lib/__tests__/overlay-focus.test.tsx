/**
 * Regression test: a text field inside a Modal must keep focus while typing.
 *
 * The payment modal declares its `close` handler in the component body, so it
 * is a new function on every render. When the overlay's focus effect depended
 * on that identity it tore down and re-ran per keystroke, restoring focus to
 * the trigger and then handing it to the close button — on a phone the
 * keyboard collapsed after a single digit.
 *
 * Run with: npx tsx src/lib/__tests__/overlay-focus.test.tsx
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const results: [string, string][] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', `${name} — ${(error as Error).message}`]);
  }
}

async function main() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  // Node 22 exposes `navigator` as a getter-only global.
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  });

  // Loaded after the DOM exists: react-dom touches document at import time.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { act } = React;
  const { createRoot } = require('react-dom/client');
  const { Modal } = require('../../components/ui/overlay');
  /* eslint-enable @typescript-eslint/no-require-imports */

  /** Mirrors PaymentModal: local state, and `close` redeclared each render. */
  function PaymentLike({ trigger }: { trigger: HTMLElement }) {
    const [amount, setAmount] = React.useState('');
    // Deliberately a NEW identity every render — the shape that broke.
    function close() {
      trigger.focus();
    }
    return React.createElement(
      Modal,
      { open: true, onClose: close, title: 'Record payment' },
      React.createElement('input', {
        id: 'amount',
        autoFocus: true,
        value: amount,
        onChange: (event: { target: { value: string } }) => setAmount(event.target.value),
      }),
    );
  }

  function mount() {
    const trigger = dom.window.document.createElement('button');
    dom.window.document.body.appendChild(trigger);
    const host = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(host);
    return { trigger, root: createRoot(host) };
  }

  function type(input: HTMLInputElement, digit: string) {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(input, input.value + digit);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }

  await check('the amount field keeps focus across keystrokes', async () => {
    const { trigger, root } = mount();
    await act(async () => {
      root.render(React.createElement(PaymentLike, { trigger }));
    });

    const input = dom.window.document.getElementById('amount') as HTMLInputElement;
    assert.ok(input, 'the field rendered');
    input.focus();
    assert.equal(dom.window.document.activeElement, input, 'precondition: field focused');

    for (const digit of ['2', '0', '0']) {
      await act(async () => type(input, digit));
      assert.equal(
        dom.window.document.activeElement,
        input,
        `focus left the field after "${input.value}" — the keyboard would collapse here`,
      );
    }

    assert.equal(input.value, '200', 'all three digits were accepted');
    await act(async () => root.unmount());
  });

  await check('an autoFocused field keeps focus when the modal opens', async () => {
    const { trigger, root } = mount();
    await act(async () => {
      root.render(React.createElement(PaymentLike, { trigger }));
    });
    assert.equal(
      dom.window.document.activeElement,
      dom.window.document.getElementById('amount'),
      'the close button grabbed focus instead of the amount field',
    );
    await act(async () => root.unmount());
  });

  let failed = 0;
  for (const [status, name] of results) {
    if (status === 'FAIL') failed += 1;
    console.log(`${status}  ${name}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
