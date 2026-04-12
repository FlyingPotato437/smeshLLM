'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-gray-800 mb-4">Oops!</h1>
            <h2 className="text-2xl font-semibold text-gray-600 mb-4">Something went wrong</h2>
            <p className="text-gray-500 mb-8">
              We&apos;re sorry, but something unexpected happened.
            </p>
            <button
              onClick={reset}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded mr-4"
            >
              Try Again
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              Go Home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}