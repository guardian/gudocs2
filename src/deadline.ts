import { performance } from 'node:perf_hooks';

export class DeadlineExceededError extends Error {}

type Work<T> = (signal: AbortSignal) => Promise<T>;

export interface Deadline {
    run<T>(label: string, work: Work<T>): Promise<T>;
}

export const noopDeadline: Deadline = {
    run: async (_label, work) => work(new AbortController().signal),
};

export function createDeadline(timeoutMs: number): Deadline {
    const expiresAt = performance.now() + timeoutMs;
    return {
        run: (label, work) => runUntil(label, expiresAt, work),
    };
}

async function runUntil<T>(
    label: string,
    expiresAt: number,
    work: Work<T>,
): Promise<T> {
    const error = new DeadlineExceededError(`Timed out: ${label}`);
    const remainingMs = Math.ceil(expiresAt - performance.now());
    if (remainingMs <= 0) throw error;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(error);
            controller.abort(error);
        }, remainingMs);
    });

    try {
        const result = await Promise.race([timeout, Promise.resolve().then(() => work(controller.signal))]);
        if (performance.now() >= expiresAt) {
            controller.abort(error);
            throw error;
        }
        return result;
    } finally {
        clearTimeout(timer);
    }
}
