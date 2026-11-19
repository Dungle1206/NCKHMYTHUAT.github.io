const input = document.querySelector("#image-input");
const dropzone = document.querySelector("#dropzone");
const preview = document.querySelector("#image-preview");
const placeholder = document.querySelector("#upload-placeholder");
const changeHint = document.querySelector("#image-change-hint");
const analyzeButton = document.querySelector("#analyze-button");
const imageStatus = document.querySelector("#image-status");
const uploadError = document.querySelector("#upload-error");
const analysisPanel = document.querySelector("#analysis-panel");
const analysisEmpty = document.querySelector("#analysis-empty");
const analysisResult = document.querySelector("#analysis-result");
const canvas = document.querySelector("#analysis-canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });
const listenButton = document.querySelector("#listen-button");
const stopButton = document.querySelector("#stop-button");
const voiceSpeed = document.querySelector("#voice-speed");

let selectedImage;
let imageUrl;
let currentStory = "";

dropzone.addEventListener("click", () => input.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.target !== dropzone || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  input.click();
});
input.addEventListener("change", () => {
  if (input.files?.[0]) loadImage(input.files[0]);
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-over");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-over");
  });
}
dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) loadImage(file);
});

function showError(message) {
  uploadError.textContent = message;
  uploadError.hidden = false;
}

function loadImage(file) {
  uploadError.hidden = true;
  if (!file.type.startsWith("image/")) {
    showError("Tệp này chưa phải là ảnh. Hãy chọn JPG, PNG hoặc WEBP nhé.");
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showError("Ảnh hơi lớn. Hãy chọn ảnh có dung lượng tối đa 15 MB.");
    return;
  }

  const nextUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = nextUrl;
    selectedImage = image;
    preview.src = imageUrl;
    preview.alt = `Ảnh tác phẩm đã chọn: ${file.name}`;
    preview.hidden = false;
    placeholder.hidden = true;
    changeHint.hidden = false;
    imageStatus.textContent = "Đã sẵn sàng";
    analyzeButton.disabled = false;
    analysisEmpty.hidden = false;
    analysisResult.hidden = true;
    analysisPanel.setAttribute("aria-busy", "false");
    speechSynthesis.cancel();
    stopButton.disabled = true;
  };
  image.onerror = () => {
    URL.revokeObjectURL(nextUrl);
    showError("Không thể mở ảnh này. Hãy thử chọn một ảnh khác.");
  };
  image.src = nextUrl;
}

analyzeButton.addEventListener("click", () => {
  if (!selectedImage) return;
  analysisPanel.setAttribute("aria-busy", "true");
  imageStatus.textContent = "Đang khám phá";
  analyzeButton.disabled = true;

  try {
    const analysis = analyzeImage(selectedImage);
    renderAnalysis(analysis);
    analysisEmpty.hidden = true;
    analysisResult.hidden = false;
    imageStatus.textContent = "Đã khám phá";
  } catch (error) {
    showError("Trình duyệt không đọc được ảnh này. Hãy thử ảnh khác.");
    imageStatus.textContent = "Chưa phân tích được";
  } finally {
    analysisPanel.setAttribute("aria-busy", "false");
    analyzeButton.disabled = false;
  }
});

function analyzeImage(image) {
  const scale = 72 / Math.max(image.width, image.height);
  const sampleWidth = Math.max(1, Math.round(image.width * scale));
  const sampleHeight = Math.max(1, Math.round(image.height * scale));
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
  const colorBuckets = new Map();
  const regions = { left: 0, center: 0, right: 0, top: 0, middle: 0, bottom: 0 };
  let brightnessTotal = 0;
  let brightnessSquareTotal = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  let leftWeight = 0;
  let rightWeight = 0;
  let upperWeight = 0;
  let lowerWeight = 0;
  const brightness = new Float32Array(sampleWidth * sampleHeight);

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const offset = (y * sampleWidth + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      brightness[y * sampleWidth + x] = light;
      brightnessTotal += light;
      brightnessSquareTotal += light * light;
      const bucket = [r, g, b].map((channel) => Math.round(channel / 32) * 32).join(",");
      const existing = colorBuckets.get(bucket) || { count: 0, r: 0, g: 0, b: 0 };
      existing.count += 1;
      existing.r += r;
      existing.g += g;
      existing.b += b;
      colorBuckets.set(bucket, existing);

      const weight = Math.abs(light - 0.5) + 0.08;
      if (x < sampleWidth / 3) regions.left += weight;
      else if (x < sampleWidth * 2 / 3) regions.center += weight;
      else regions.right += weight;
      if (y < sampleHeight / 3) regions.top += weight;
      else if (y < sampleHeight * 2 / 3) regions.middle += weight;
      else regions.bottom += weight;
      if (x < sampleWidth / 2) leftWeight += light;
      else rightWeight += light;
      if (y < sampleHeight / 2) upperWeight += light;
      else lowerWeight += light;

      if (x > 0) {
        edgeTotal += Math.abs(light - brightness[y * sampleWidth + x - 1]);
        edgeCount += 1;
      }
      if (y > 0) {
        edgeTotal += Math.abs(light - brightness[(y - 1) * sampleWidth + x]);
        edgeCount += 1;
      }
    }
  }

  const pixelCount = sampleWidth * sampleHeight;
  const mean = brightnessTotal / pixelCount;
  const contrast = Math.sqrt(Math.max(0, brightnessSquareTotal / pixelCount - mean * mean));
  const texture = edgeTotal / edgeCount;
  const colors = [...colorBuckets.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([key, color]) => ({
      hex: `#${[color.r, color.g, color.b].map((value) => Math.round(value / color.count).toString(16).padStart(2, "0")).join("")}`,
      rgb: key.split(",").map(Number),
    }));

  return {
    composition: describeComposition(regions, leftWeight, rightWeight, upperWeight, lowerWeight, mean, contrast),
    colors,
    colorDescription: describeColors(colors, mean, contrast),
    rhythm: describeRhythm(texture, contrast),
    story: tellStory(regions, colors, mean, texture),
    lyrics: writeLyrics(regions, colors, mean, texture),
  };
}

function describeComposition(regions, left, right, upper, lower, mean, contrast) {
  const horizontal = maximumKey({ trái: regions.left, giữa: regions.center, phải: regions.right });
  const vertical = maximumKey({ trên: regions.top, giữa: regions.middle, dưới: regions.bottom });
  const horizontalBalance = Math.abs(left - right) / Math.max(left, right, 1);
  const verticalBalance = Math.abs(upper - lower) / Math.max(upper, lower, 1);
  const weight = horizontalBalance < 0.1 && verticalBalance < 0.1
    ? "Ánh sáng được chia khá đều giữa các phía, tạo cảm giác cân bằng."
    : horizontalBalance > 0.24 || verticalBalance > 0.24
      ? `Ánh sáng nghiêng nhẹ về ${left > right ? "phía trái" : "phía phải"} và ${upper > lower ? "phần trên" : "phần dưới"}, khiến mắt được dẫn về một vùng nổi bật.`
      : "Ánh sáng được phân chia tương đối hài hòa giữa các phần.";
  const contrastText = contrast > 0.24
    ? "Sáng tối tương phản rõ, giúp các mảng chính dễ được nhận ra."
    : contrast < 0.13
      ? "Sáng tối dịu và gần nhau, tạo cảm giác êm, liền mạch."
      : "Sáng tối vừa phải, giữ được sự cân bằng trong tổng thể.";
  return `Các mảng thị giác tập trung nhiều hơn ở vùng ${horizontal.toLowerCase()} và ${vertical.toLowerCase()}. ${weight} ${contrastText} Đây là nhận xét từ phân bố sáng tối của ảnh, không phải nhận diện vật thể.`;
}

function describeColors(colors, mean, contrast) {
  const hues = colors.map(({ rgb }) => {
    const [r, g, b] = rgb;
    if (r > g * 1.18 && r > b * 1.15) return "ấm";
    if (b > r * 1.12 && g > r * 1.03) return "mát";
    if (r > b * 1.15 && g > b * 1.1) return "thiên xanh lá";
    return "trung tính";
  });
  const warm = hues.filter((hue) => hue === "ấm").length;
  const cool = hues.filter((hue) => hue === "mát" || hue === "thiên xanh lá").length;
  const palette = warm > cool ? "ấm" : cool > warm ? "mát" : "hài hòa giữa ấm và mát";
  const mood = mean > 0.67 ? "sáng và thoáng" : mean < 0.35 ? "trầm và lắng" : "dịu nhẹ";
  const depth = contrast > 0.22 ? "có những điểm nhấn nổi bật" : "các màu chuyển tiếp mềm mại";
  return `Bảng màu nghiêng về sắc ${palette}, mang cảm giác ${mood}; ${depth}. Màu được trích từ những vùng xuất hiện nhiều nhất trong ảnh.`;
}

function describeRhythm(texture, contrast) {
  if (texture > 0.13) return "Các thay đổi sáng tối khá dày và rõ, gợi một nhịp thị giác rộn ràng, nhiều chi tiết. Phân tích ảnh không thể xác định chính xác hướng hay chất liệu nét vẽ.";
  if (texture < 0.055 && contrast < 0.18) return "Sáng tối chuyển nhẹ và ít đột ngột, tạo nhịp điệu chậm rãi, thoáng đãng như một khoảng lặng.";
  if (texture < 0.08) return "Các mảng sáng tối nối tiếp khá êm, gợi nhịp điệu mềm và thư thả.";
  return "Sáng tối thay đổi vừa phải, tạo nhịp điệu đều với một vài điểm nhấn thị giác.";
}

function tellStory(regions, colors, mean, texture) {
  const focus = maximumKey({ "phía trái": regions.left, "chính giữa": regions.center, "phía phải": regions.right });
  const firstColor = colors[0]?.rgb ?? [140, 140, 130];
  const tone = firstColor[0] > firstColor[2] * 1.18
    ? "Những sắc màu ấm như đang giữ lại chút nắng cuối ngày."
    : firstColor[2] > firstColor[0] * 1.15
      ? "Những sắc màu mát mở ra một khoảng trời bình yên."
      : "Những sắc màu dịu khẽ đan vào nhau.";
  const pace = texture > 0.11
    ? "Nhiều chuyển động nhỏ rủ mắt ta đi qua từng vùng sáng tối."
    : "Nhịp điệu thong thả mời ta dừng lại lâu hơn một chút.";
  const light = mean > 0.62 ? "Ánh sáng ở đây rộng mở, như một lời chào." : mean < 0.37 ? "Ánh sáng lắng sâu, như cất giữ một điều chưa kể." : "Ánh sáng vừa đủ dịu để mọi thứ gần nhau hơn.";
  return `Hãy thử bắt đầu từ ${focus}. ${tone} ${light} ${pace} Có lẽ bức tranh đang thì thầm rằng: đôi khi chỉ cần chậm lại, ta sẽ nhìn thấy điều mình bỏ lỡ. Câu chuyện này được gợi ý từ sắc độ và bố cục; cảm nhận của bạn vẫn là điều quan trọng nhất.`;
}

function writeLyrics(regions, colors, mean, texture) {
  const focus = maximumKey({ "phía trái": regions.left, "chính giữa": regions.center, "phía phải": regions.right });
  const firstColor = colors[0]?.rgb ?? [140, 140, 130];
  const colorLine = firstColor[0] > firstColor[2] * 1.18
    ? "Sắc ấm hong miền ký ức."
    : firstColor[2] > firstColor[0] * 1.15
      ? "Sắc mát ru miền yên ả."
      : "Muôn sắc đan thành lời ca.";
  const lightLine = mean > 0.62
    ? "Nắng mở lối, chân trời xanh."
    : mean < 0.37
      ? "Bóng sâu ôm điều chưa nói."
      : "Ánh dịu khẽ chạm bờ vai.";
  const rhythmLine = texture > 0.11
    ? "Nét reo theo nhịp rộn ràng."
    : "Nét trôi chậm giữa mênh mang.";

  return `Từ ${focus}, câu hát khẽ ngân,\n${colorLine}\n${lightLine}\n${rhythmLine}\nChậm thôi, chậm thôi, nghe lòng mình gần bức tranh.`;
}

function maximumKey(values) {
  return Object.entries(values).sort((a, b) => b[1] - a[1])[0][0];
}

function renderAnalysis(analysis) {
  document.querySelector("#composition-text").textContent = analysis.composition;
  document.querySelector("#color-text").textContent = analysis.colorDescription;
  document.querySelector("#rhythm-text").textContent = analysis.rhythm;
  document.querySelector("#story-text").textContent = analysis.story;
  document.querySelector("#lyric-text").textContent = analysis.lyrics;
  currentStory = `${analysis.composition} ${analysis.colorDescription} ${analysis.rhythm} Lời kể: ${analysis.story}`;
  const palette = document.querySelector("#palette");
  palette.replaceChildren(...analysis.colors.map((color, index) => {
    const swatch = document.createElement("span");
    swatch.className = "palette-swatch";
    swatch.style.backgroundColor = color.hex;
    swatch.setAttribute("aria-label", `Màu chủ đạo ${index + 1}: ${color.hex}`);
    return swatch;
  }));
}

listenButton.addEventListener("click", () => {
  if (!currentStory || !("speechSynthesis" in window)) {
    showError("Thiết bị hoặc trình duyệt này chưa hỗ trợ đọc lời kể thành tiếng.");
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(currentStory);
  utterance.lang = "vi-VN";
  utterance.rate = Number(voiceSpeed.value);
  utterance.onstart = () => {
    listenButton.disabled = true;
    stopButton.disabled = false;
  };
  utterance.onend = () => {
    listenButton.disabled = false;
    stopButton.disabled = true;
  };
  utterance.onerror = () => {
    listenButton.disabled = false;
    stopButton.disabled = true;
    showError("Không thể phát giọng đọc. Hãy kiểm tra hỗ trợ giọng tiếng Việt của thiết bị.");
  };
  speechSynthesis.speak(utterance);
});

stopButton.addEventListener("click", () => {
  speechSynthesis.cancel();
  listenButton.disabled = false;
  stopButton.disabled = true;
});
