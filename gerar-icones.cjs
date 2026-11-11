/* Gera ícones e telas de abertura do DUDA a partir do desenho vetorial (rode: node scripts/gerar-icones.cjs) */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const D_PATH =
  "M290 280H520C668 280 760 378 760 512C760 646 668 744 520 744H290V728H340V296H290Z" +
  "M420 320V704H515C618 704 680 626 680 512C680 398 618 320 515 320Z";

function iconSvg({ rounded = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4C6A54"/><stop offset="1" stop-color="#36503E"/>
    </linearGradient>
    <linearGradient id="d" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFDF7"/><stop offset="1" stop-color="#EFEADB"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" ${rounded ? 'rx="228"' : ""} fill="url(#g)"/>
  <path d="${D_PATH}" fill="url(#d)" fill-rule="evenodd"/>
  <circle cx="808" cy="712" r="34" fill="#C49A56"/>
</svg>`;
}

const SPLASH = [
  [1320, 2868, 440, 956, 3], [1290, 2796, 430, 932, 3], [1260, 2736, 420, 912, 3], [1206, 2622, 402, 874, 3],
  [1179, 2556, 393, 852, 3], [1284, 2778, 428, 926, 3], [1170, 2532, 390, 844, 3], [1125, 2436, 375, 812, 3],
  [1242, 2688, 414, 896, 3], [828, 1792, 414, 896, 2], [1242, 2208, 414, 736, 3], [750, 1334, 375, 667, 2], [640, 1136, 320, 568, 2]
];

function splashHtml(w, h, dark) {
  const s = Math.round(Math.min(w, h) * 0.26);
  const bg = dark ? "#18211B" : "#F7F5EC";
  const fg = dark ? "#B9D0B7" : "#405B48";
  return `<html><body style="margin:0;width:${w}px;height:${h}px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(s * 0.28)}px">
  <div style="width:${s}px;height:${s}px">${iconSvg({ rounded: true }).replace("<svg ", `<svg width="${s}" height="${s}" `)}</div>
  <div style="font-family:'Inter Display';font-weight:300;font-size:${Math.round(s * 0.2)}px;letter-spacing:.42em;margin-right:-.42em;color:${fg}">DUDA</div>
  </body></html>`;
}

(async () => {
  const out = path.join(ROOT, "public", "icons");
  const splashDir = path.join(ROOT, "public", "splash");
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(splashDir, { recursive: true });
  fs.writeFileSync(path.join(out, "icon.svg"), iconSvg({ rounded: true }));
  fs.writeFileSync(path.join(out, "icon-fullbleed.svg"), iconSvg());

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (html, w, h, file) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html);
    await page.screenshot({ path: file, omitBackground: false });
  };
  const full = (size) => `<html><body style="margin:0">${iconSvg().replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`;
  const round = (size) => `<html><body style="margin:0;background:transparent">${iconSvg({ rounded: true }).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`;
  // iOS arredonda os cantos sozinho: o apple-touch-icon é quadrado e sem transparência
  await render(full(180), 180, 180, path.join(out, "apple-touch-icon.png"));
  await render(full(192), 192, 192, path.join(out, "icon-192.png"));
  await render(full(512), 512, 512, path.join(out, "icon-512.png"));
  await render(full(512), 512, 512, path.join(out, "icon-maskable-512.png"));
  await page.setViewportSize({ width: 32, height: 32 });
  await page.setContent(round(32));
  await page.screenshot({ path: path.join(out, "favicon-32.png"), omitBackground: true });

  const links = [];
  for (const [w, h, cw, ch, r] of SPLASH) {
    for (const dark of [false, true]) {
      const name = `splash-${w}x${h}${dark ? "-escuro" : ""}.png`;
      await render(splashHtml(w, h, dark), w, h, path.join(splashDir, name));
      links.push(
        `<link rel="apple-touch-startup-image" href="/splash/${name}" media="(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait) and (prefers-color-scheme: ${dark ? "dark" : "light"})" />`
      );
    }
  }
  await browser.close();

  const indexPath = path.join(ROOT, "index.html");
  const html = fs.readFileSync(indexPath, "utf8").replace(/<!--SPLASH-->[\s\S]*?<!--\/SPLASH-->|<!--SPLASH-->/, "<!--SPLASH-->\n    " + links.join("\n    ") + "\n    <!--/SPLASH-->");
  fs.writeFileSync(indexPath, html);
  console.log("ícones e", links.length, "telas de abertura gerados");
})();
