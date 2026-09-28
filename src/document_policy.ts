export type Audience = "finance" | "volunteer" | "campaign";
export type DocumentKind = "receipt" | "reminder" | "report";

export function allowedKinds(audience: Audience): DocumentKind[] {
  switch (audience) {
    case "finance": return ["receipt", "reminder", "report"];
    case "volunteer": return ["reminder", "report"];
    case "campaign": return ["report"];
  }
}

export function mayRead(audience: Audience, kind: DocumentKind): boolean {
  return allowedKinds(audience).includes(kind);
}
