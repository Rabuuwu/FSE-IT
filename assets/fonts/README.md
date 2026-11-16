# Local interface fonts

- **Manrope**, variable weight500–800: headings, brand and summary numbers.
- **Source Sans3**, variable weight400–700: reading text, navigation, forms and buttons.

WOFF2 Latin and Latin Extended subsets include Polish diacritics. Four font files total128668bytes. Both families use `font-display:swap` and local system fallbacks. No request to Google Fonts is made by the running application.

Files were downloaded through the official Google Fonts CSS API; exact URLs and byte sizes are recorded in `sources.json`. The full SIL Open Font License notices are preserved in `LICENSE-MANROPE.txt` and `LICENSE-SOURCESANS3.txt`, from the corresponding `ofl/` directories of https://github.com/google/fonts.

`css/fonts.css` contains the original subset ranges; `css/theme.css` assigns the two type roles and the shared contrast palette. Source shapes and font files are unmodified. Monospaced system rendering remains appropriate for literal code samples.
