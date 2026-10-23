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

- Mandatory task notices are mounted once in AppShell; database RPCs scope recipients and persist acknowledgement per scheduled occurrence independently of completion, so navigation and recurrence cannot lose read state.
- Task notice eligibility is assigned by a database trigger for new manager/PAP leader tasks; scheduling uses America/Sao_Paulo and the database clock, so client role flags and device time cannot decide access or due time.
- Dashboard person selections expand and deduplicate managers' descendants only within the already-authorized team through selecionarEquipe, keeping totals and rankings on the same scope.
- Selective prospect cleanup uses an authenticated role-checked database RPC that atomically archives only selected statuses within the existing authorized scope, preserving all other rows.
- Sales and report month filters use shared disjoint date intervals, so unselected months never enter totals.
- Existing referral sales preload unambiguous referrer records and synchronize referrals only on creation or a change into the referral channel, preventing routine edits from creating duplicates.
- Global auth sign-out cancels and clears protected queries before navigating to login; failed data reads must throw rather than masquerade as empty results.
- Dashboard WhatsApp alerts query only open block periods for consultants in the existing authorized team, independently of sales filters, and refresh periodically so current blocks are not tied to historical months.
- The team WhatsApp panel owns an independent month selector; monthly durations are clipped to that month while open periods keep current status independent of the selected month.
