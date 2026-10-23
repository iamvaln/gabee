import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { reportError, setErrorReporterForTests } from './report-error';

test('reportError logs and forwards to Sentry with scope tag', () => {
  const captured: { err: unknown; hint: unknown }[] = [];
  setErrorReporterForTests((err, hint) => {
    captured.push({ err, hint });
  });
  const logged = mock.method(console, 'error', () => {});
  try {
    const err = new Error('boom');
    reportError(err, { scope: 'content.job', jobKey: 'day.generate', periodKey: 'day:2026-10-29' });

    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.err, err);
    assert.deepEqual(captured[0]?.hint, {
      tags: { scope: 'content.job' },
      extra: { scope: 'content.job', jobKey: 'day.generate', periodKey: 'day:2026-10-29' },
    });

    assert.equal(logged.mock.callCount(), 1);
    const line = String(logged.mock.calls[0]?.arguments[0]);
    assert.match(line, /^\[content\.job\] /);
    assert.match(line, /boom/);
  } finally {
    logged.mock.restore();
    setErrorReporterForTests(null);
  }
});

test('reportError never throws, even for non-Error values or a failing reporter', () => {
  setErrorReporterForTests(() => {
    throw new Error('sentry down');
  });
  const logged = mock.method(console, 'error', () => {});
  try {
    assert.doesNotThrow(() => reportError('plain string', { scope: 'x' }));
    assert.match(String(logged.mock.calls[0]?.arguments[0]), /^\[x\] plain string/);
  } finally {
    logged.mock.restore();
    setErrorReporterForTests(null);
  }
});
