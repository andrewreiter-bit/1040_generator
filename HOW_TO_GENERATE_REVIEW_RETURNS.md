# How to generate returns for review

This produces complete, merged sample returns (Form 1040 with every schedule, form and source document the household needs) for tax years 2023, 2024 and 2025. Each one is checked for internal consistency before you hand it off. A full run takes about a minute.

All data is synthetic: names, SSNs, EINs, employers and addresses are generated. None of it belongs to a real person.

## The profiles

| Profile | What it is | Same household every run? |
|---|---|---|
| `original_random` | A **random household**: filing status, income mix, dependents and deductions all change with the seed. | Same seed, same household |
| `jordan_single` | **Consistent persona:** Jordan Taylor, single, Springfield IL. Fixed identity; income amounts vary with the seed. | Identity fixed |
| `rivera_mfj` | **Consistent persona:** the Rivera family, married filing jointly with children, Columbus OH. Fixed identity; income amounts vary with the seed. | Identity fixed |
| `retired_single` | A low-income single retiree or person on disability with a small pension, built to claim the credit for the elderly or the disabled (Schedule R). | Same seed, same household |

The first three are the main review set; `retired_single` is optional.

## Steps

Run everything from the project folder.

**1. One-time setup** (skip if already done):

```bash
npm install
```

**2. Start with an empty output folder**, so nothing from an earlier run gets mixed in:

```bash
rm -rf output && mkdir -p output/review
```

**3. Generate, check and collect each profile.** The number after the profile name is the *seed*. Seed 100 produces the same returns every time; use a different number to get different households.

```bash
for p in original_random jordan_single rivera_mfj retired_single; do ./generate_returns.sh $p 100 && npm run -s validate -- --profiles $p --base-seed 100 --gate 3 && cp output/${p}_*_return.pdf output/review/; done
```

Each profile should end with `✓ all gated checks passed`. That line means the validator re-checked the same returns (same seeds) and found the forms consistent with each other and with the household's data. If a profile prints `✗`, don't send its returns; see "If something fails" below.

**4. Put the project back to its default state.** The generator temporarily swaps in the chosen profile; this undoes that:

```bash
git checkout -- src/faker/factory.ts
```

**5. Send the files in `output/review/`.** There are 12 PDFs, one per profile per year, named like `rivera_mfj_2025_return.pdf`. Send only these: the other files in `output/` are the individual forms they were built from.

## What the reviewers will see

- **What's in each PDF.** Each file is one complete return: Form 1040, then every attached schedule and form, then the source documents (W-2s, 1099s, 1098s, 1095-A, W-2G and so on).
- **Page counts.** The PDFs run 20–80 pages because each W-2 and 1099 includes all of its copies (A, B, C, 1, 2, D), as the IRS form prints them. Reviewers can skip the duplicate copies; Copy B is the one the taxpayer files with.
- **Years.** 2023, 2024 and 2025 only. 2026 returns can't be produced until the IRS publishes the final 2026 forms (expected December–January).
- **Blank fields.** Fields the household has no data for are left blank on purpose, rather than filled with placeholder numbers.
- **Known limitations.** The project README lists what isn't modelled; look for the "Not modelled" notes in each section. For a review, the main ones are:
  - Schedule 1-A tips use W-2 box 7. The five tipped-occupation names are illustrative, not from Treasury's official list.
  - On Schedule C, vehicle loan interest goes on line 16b and personal property tax on line 23, as the Schedule C instructions direct (some tax software puts both on line 9).

## Options

- **Different households:** change the seed, for example `./generate_returns.sh original_random 250`, and use the same number in the `validate` command.
- **More than one set:** run step 3 with several seeds, such as 100, 200 and 300. Copy each set into its own folder before the next run, since each run overwrites the files of the same name.

## If something fails

- **`Error: Missing backup folder 'forms_2023'`** (or 2024/2025): the installed IRS forms are missing from the project folder. Ask whoever set up the project.
- **A `✗` from the validator:** the output names the failing check. Don't send those returns. Either try another seed, or save the output and pass it to the project's maintainer.
- **`git status` shows `src/faker/factory.ts` as changed:** run step 4 again.
