# Fonts for the invoice PDF

`Roboto-Regular.ttf` and `Roboto-Bold.ttf` are Roboto 2.137 by Google (Christian Robertson),
licensed under the Apache License 2.0 (`LICENSE-Roboto.txt`). They are the same files the PDF
used to download from `fonts.gstatic.com` (`/s/roboto/v30/`) every time the API started, so an
API without a route to Google could not make any invoice PDF. Keep them in the image: the
Dockerfile copies this folder next to `dist/`.

They cover Estonian (õ ä ö ü š ž), the euro sign and the typographic quotes.
