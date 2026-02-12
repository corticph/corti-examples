export function JsonComponent({ data }: {
    data: unknown;
}) {
    return (
        <pre>{JSON.stringify(data, null, 2)}</pre>
    );
}
