"use client";

import { Button } from "@/app/components/Button";

type IntroViewProps = {
  onAuthenticateWithCC: () => void;
  onAuthenticateWithROPC: () => void;
  onAuthenticateWithAuthCode: () => void;
  onAuthenticateWithPkce: () => void;
};

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
        <code className="bg-gray-100 px-1 rounded">README.md</code> for setup instructions and
        important security notes.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
        <Button type="button" size="lg" onClick={onAuthenticateWithCC}>
          Authenticate with Client Credentials
        </Button>
        <Button type="button" size="lg" onClick={onAuthenticateWithROPC}>
          Authenticate with ROPC
        </Button>
        <Button type="button" size="lg" onClick={onAuthenticateWithAuthCode}>
          Authenticate with Authorization Code
        </Button>
        <Button type="button" size="lg" onClick={onAuthenticateWithPkce}>
          Authenticate with PKCE
        </Button>
      </div>
    </>
  );
}
