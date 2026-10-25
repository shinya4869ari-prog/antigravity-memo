/* A single clipboard entry carries text and a PNG representation. */
const SharedPadTransfer = (() => {
  const validImage = src => /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(src);
  function loadImage(src) {
    if (!validImage(src)) return Promise.reject(new Error('画像形式を確認してください'));
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('画像を読み込めませんでした'));
      image.src = src;
    });
  }
  async function png(text, sources) {
    const images = await Promise.all(sources.map(loadImage));
    const canvas = document.createElement('canvas');
    const width = Math.max(800, ...images.map(image => image.naturalWidth));
    const padding = 24, lineHeight = 28;
    const ctx = canvas.getContext('2d');
    ctx.font = '18px sans-serif';
    const lines = [];
    for (const paragraph of text.replace(/\t/g, '    ').split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (ctx.measureText(line + char).width > width - padding * 2) { lines.push(line); line = ''; }
        line += char;
      }
      lines.push(line);
    }
    const textHeight = text ? lines.length * lineHeight + padding * 2 : 0;
    const height = Math.max(1, textHeight + images.reduce((sum, image) => sum + image.naturalHeight + padding, 0));
    if (height > 16000 || width * height > 24000000) throw new Error('一括画像にするには長すぎます。本文のみコピーと各画像の保存を使ってください');
    canvas.width = width; canvas.height = height;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827'; ctx.font = '18px sans-serif'; ctx.textBaseline = 'top';
    if (text) lines.forEach((line, index) => ctx.fillText(line, padding, padding + index * lineHeight));
    let y = textHeight;
    images.forEach(image => { ctx.drawImage(image, 0, y); y += image.naturalHeight + padding; });
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('画像を生成できませんでした')), 'image/png'));
  }
  function copy(text, images) {
    if (!images.length) return navigator.clipboard.writeText(text);
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      return Promise.reject(new Error('このブラウザでは画像をコピーできません。「まとめて画像保存」を使ってください'));
    }
    // Pass a promise immediately so Safari retains the click's user activation.
    const image = png(text, images);
    image.catch(() => {});
    return navigator.clipboard.write([new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'image/png': image
    })]);
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return { copy, png, download };
})();
