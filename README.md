# peek-panel

Open content in a panel that slides over your page, while a slim strip of the page stays visible beside it. Hover the strip to peek at what's behind; click it, swipe it or press Esc to slide the panel away.

**[See the live demo →](https://estherchaep.github.io/peek-panel/)**

Works on any website: plain HTML, Webflow, WordPress, Squarespace, React, Vue and more. On phones the strip moves to the top and the panel slides up.

## Add it to your site

**1. Load it.** Paste this line into your site's `<head>` (in Webflow: *Site settings → Custom code*; in WordPress: a header-scripts plugin; in Squarespace: *Code injection*):

```html
<script src="https://cdn.jsdelivr.net/npm/peek-panel@0.1.0/dist/peek-panel.min.js"></script>
```

**2. Add a button** anywhere on your page. `data-peek-open` points to the panel it opens:

```html
<button data-peek-open="my-panel">Open</button>
```

**3. Put your content in a panel** with the matching `id`:

```html
<peek-panel id="my-panel">
  <button data-peek-close>← Back</button>
  <h2>Anything you like</h2>
  <p>A case study, a product page, a gallery…</p>
</peek-panel>
```

That's it. Click the button and the panel slides in. Add as many panels as you like, each with its own `id`.

## Make it yours

Change how it behaves by adding words to the tag:

```html
<peek-panel id="my-panel" peek-distance="40" spring-time="0.8">
```

| Add this | What it does |
|---|---|
| `peek-distance="40"` | A bigger peek when you hover the strip (default `24`) |
| `spring-time="0.8"` | A faster slide in and out (default `1.1` seconds) |
| `spring-bounce="0"` | No bounce at the end of the slide (default `0.2`) |
| `no-cursor` | Keep the normal mouse pointer over the strip |

Change how it looks with a few lines of CSS:

```css
peek-panel {
  --peek-panel-background: #fff;  /* panel colour */
  --peek-radius: 32px;            /* corner roundness */
  --peek-strip-size: 48px;        /* width of the strip */
}
```

**More options** (every setting, styling, JavaScript, React and Vue) are in the **[full reference](https://github.com/estherchaep/peek-panel/blob/main/docs/REFERENCE.md)**.

## Using a code project?

If your site is built with npm (React, Next.js, Vue and similar):

```bash
npm install peek-panel
```

```js
import "peek-panel"
```

Then use the `<peek-panel>` tag as above. See [using it in frameworks](https://github.com/estherchaep/peek-panel/blob/main/docs/REFERENCE.md#using-it-in-frameworks) for React and Vue tips.
