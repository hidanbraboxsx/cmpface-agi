<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Loan validation and score/amount rules live in src/lib/loan.ts (shared client+server); server functions in src/lib/inquiry.functions.ts recompute them so the browser can't tamper with results.
- loan_inquiries table has RLS with no public policies; inserts happen only via the server function with the admin client.
- Identity verification must fail closed until an authorized provider returns real name and birth date; CPF check digits are not identity verification.
- Consultation stage gates live in src/lib/consultation.ts and the arc meter in a focused ScoreGauge component, keeping requirements testable and animation isolated.
- Bank images use stored high-resolution asset pointers and a focused BankLogo fallback, avoiding third-party image requests and broken-image UI.
