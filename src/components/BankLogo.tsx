import { useState } from "react";
import { Landmark } from "lucide-react";

export function BankLogo({ src, name }: { src: string | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card">
      {src && !failed ? (
        <img src={src} alt={`Logo ${name}`} width={40} height={40} decoding="async" className="max-h-full max-w-full object-contain" onError={() => setFailed(true)} />
      ) : <Landmark aria-label={name} className="size-6 text-muted-foreground" />}
    </span>
  );
}