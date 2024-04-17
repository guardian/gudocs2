export function delay<T>(ms: number, then: () => Promise<T>) {
    let interval: NodeJS.Timeout | undefined;
    const promise = new Promise(resolve => interval = setTimeout(resolve, ms)).then(then);
    return {
        cancel() { clearTimeout(interval); },
        promise
    };
}
