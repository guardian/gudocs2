import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import type { mock } from 'node:test';
import { createDeadline, DeadlineExceededError, noopDeadline } from './deadline';

function mockClock(tracker: typeof mock) {
    let now = 0;
    tracker.method(performance, 'now', () => now);
    // The installed Node types predate the mock timer options object.
    (tracker.timers.enable as unknown as (options: { apis: string[] }) => void)({ apis: ['setTimeout'] });
    return (ms: number) => {
        now += ms;
        tracker.timers.tick(ms);
    };
}

test('returns completed work and clears its timer', async t => {
    const advance = mockClock(t.mock);
    const signal = await createDeadline(20).run('complete', async signal => signal);

    advance(20);
    assert.equal(signal.aborted, false);
});

test('preserves work errors and clears the timer on failure', async t => {
    const advance = mockClock(t.mock);
    const failure = new Error('upstream failure');
    let workSignal: AbortSignal | undefined;
    const result = createDeadline(20).run('failed', async signal => {
        workSignal = signal;
        throw failure;
    });

    await assert.rejects(result, error => error === failure);
    advance(20);
    assert.equal(workSignal?.aborted, false);
});

test('shares one budget across steps and aborts a stalled step with its label', async t => {
    const advance = mockClock(t.mock);
    const deadline = createDeadline(20);
    await deadline.run('metadata', async () => { advance(15); });

    let workSignal: AbortSignal | undefined;
    const stalled = deadline.run('values', signal => {
        workSignal = signal;
        return new Promise<never>(() => undefined);
    });
    const rejected = assert.rejects(stalled, error =>
        error instanceof DeadlineExceededError && error.message === 'Timed out: values'
    );
    await Promise.resolve();
    assert.ok(workSignal);
    advance(4);
    assert.equal(workSignal.aborted, false);
    advance(1);
    await rejected;
    assert.equal(workSignal.aborted, true);
});

test('does not start work once the shared deadline has expired', async t => {
    const advance = mockClock(t.mock);
    const deadline = createDeadline(20);
    advance(20);

    const work = t.mock.fn(async () => 'unexpected');
    await assert.rejects(deadline.run('not-started', work), /Timed out: not-started/);
    assert.equal(work.mock.callCount(), 0);
});

test('the no-op deadline runs work without scheduling a timeout', async t => {
    const schedule = t.mock.method(globalThis, 'setTimeout');
    const signal = await noopDeadline.run('unbounded', async signal => signal);
    assert.equal(signal.aborted, false);
    assert.equal(schedule.mock.callCount(), 0);
});
