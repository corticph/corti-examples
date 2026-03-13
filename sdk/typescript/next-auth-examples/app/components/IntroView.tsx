"use client";

type IntroViewProps = {
  onAuthenticateWithCC: () => void;
  onAuthenticateWithROPC: () => void;
  onAuthenticateWithAuthCode: () => void;
  onAuthenticateWithPkce: () => void;
};

const buttonClassName =
  "px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors";

export function IntroView({
  onAuthenticateWithCC,
  onAuthenticateWithROPC,
  onAuthenticateWithAuthCode,
  onAuthenticateWithPkce,
}: IntroViewProps) {
  return (
    <>
      <p className="text-gray-500 max-w-md mb-6">
        SDK usage examples will be added here. See{" "}
        <code className="bg-gray-100 px-1 rounded">README.md</code> for setup
        instructions and important security notes.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
        <button
          type="button"
          onClick={onAuthenticateWithCC}
          className={buttonClassName}
        >
          Authenticate with Client Credentials
        </button>
        <button
          type="button"
          onClick={onAuthenticateWithROPC}
          className={buttonClassName}
        >
          Authenticate with ROPC
        </button>
        <button
          type="button"
          onClick={onAuthenticateWithAuthCode}
          className={buttonClassName}
        >
          Authenticate with Authorization Code
        </button>
        <button
          type="button"
          onClick={onAuthenticateWithPkce}
          className={buttonClassName}
        >
          Authenticate with PKCE
        </button>
      </div>
    </>
  );
}
