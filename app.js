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
const voiceSelect = document.querySelector("#voice-select");
const voiceStatus = document.querySelector("#voice-status");
const musicToggle = document.querySelector("#music-toggle");
const analysisPerspective = document.querySelector("#analysis-perspective");

let selectedImage;
let imageUrl;
let currentStory = "";
let narrationMusic;
let currentAnalysis;
let vietnameseVoices = [];

function loadVietnameseVoices() {
  if (!("speechSynthesis" in window)) return;
  const previousVoice = vietnameseVoices[Number(voiceSelect.value)] ?? null;
  vietnameseVoices = speechSynthesis.getVoices()
    .filter((voice) => /^vi(?:-|$)/i.test(voice.lang))
    .sort((a, b) => voicePreference(b) - voicePreference(a) || a.name.localeCompare(b.name));

  voiceSelect.replaceChildren(new Option("Giọng Việt ưu tiên", "auto"));
  vietnameseVoices.forEach((voice, index) => {
    const option = new Option(`${voice.name} (${voice.lang})`, String(index));
    voiceSelect.add(option);
  });
  if (previousVoice) {
    const matchingVoice = vietnameseVoices.findIndex((voice) =>
      voice.name === previousVoice.name && voice.lang === previousVoice.lang);
    if (matchingVoice >= 0) voiceSelect.value = String(matchingVoice);
  }
  voiceStatus.textContent = vietnameseVoices.length
    ? `Tìm thấy ${vietnameseVoices.length} giọng tiếng Việt. Có thể đổi giọng ở danh sách này.`
    : "Chưa tìm thấy giọng tiếng Việt trên thiết bị. Hãy cài thêm giọng Việt trong cài đặt hệ điều hành.";
}

function voicePreference(voice) {
  const name = voice.name.toLowerCase();
  return (/(natural|neural)/.test(name) ? 4 : 0)
    + (/google/.test(name) ? 2 : 0)
    + (voice.default ? 1 : 0);
}

if ("speechSynthesis" in window) {
  speechSynthesis.addEventListener("voiceschanged", loadVietnameseVoices);
  loadVietnameseVoices();
  window.setTimeout(loadVietnameseVoices, 300);
}

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
    stopNarrationMusic();
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
  const cells = Array.from({ length: 9 }, () => ({
    brightnessTotal: 0,
    brightnessSquareTotal: 0,
    saturationTotal: 0,
    edgeTotal: 0,
    edgeCount: 0,
    count: 0,
  }));
  let brightnessTotal = 0;
  let brightnessSquareTotal = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  let leftWeight = 0;
  let rightWeight = 0;
  let leftCount = 0;
  let rightCount = 0;
  let upperWeight = 0;
  let lowerWeight = 0;
  let upperCount = 0;
  let lowerCount = 0;
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
      const maximum = Math.max(r, g, b);
      const cell = cells[Math.min(2, Math.floor(y * 3 / sampleHeight)) * 3 + Math.min(2, Math.floor(x * 3 / sampleWidth))];
      cell.brightnessTotal += light;
      cell.brightnessSquareTotal += light * light;
      cell.saturationTotal += maximum === 0 ? 0 : (maximum - Math.min(r, g, b)) / maximum;
      cell.count += 1;
      const bucket = [r, g, b].map((channel) => Math.round(channel / 32) * 32).join(",");
      const existing = colorBuckets.get(bucket) || { count: 0, r: 0, g: 0, b: 0 };
      existing.count += 1;
      existing.r += r;
      existing.g += g;
      existing.b += b;
      colorBuckets.set(bucket, existing);

      if (x < sampleWidth / 2) leftWeight += light;
      if (x < sampleWidth / 2) leftCount += 1;
      else {
        rightWeight += light;
        rightCount += 1;
      }
      if (y < sampleHeight / 2) upperWeight += light;
      else lowerWeight += light;
      if (y < sampleHeight / 2) upperCount += 1;
      else lowerCount += 1;

      if (x > 0) {
        const edge = Math.abs(light - brightness[y * sampleWidth + x - 1]);
        edgeTotal += edge;
        edgeCount += 1;
        cell.edgeTotal += edge;
        cell.edgeCount += 1;
      }
      if (y > 0) {
        const edge = Math.abs(light - brightness[(y - 1) * sampleWidth + x]);
        edgeTotal += edge;
        edgeCount += 1;
        cell.edgeTotal += edge;
        cell.edgeCount += 1;
      }
    }
  }

  const pixelCount = sampleWidth * sampleHeight;
  const mean = brightnessTotal / pixelCount;
  const contrast = Math.sqrt(Math.max(0, brightnessSquareTotal / pixelCount - mean * mean));
  const texture = edgeTotal / edgeCount;
  const focus = findVisualFocus(cells, mean);
  const horizontalBalance = leftCount && rightCount
    ? Math.abs(leftWeight / leftCount - rightWeight / rightCount)
    : null;
  const verticalBalance = upperCount && lowerCount
    ? Math.abs(upperWeight / upperCount - lowerWeight / lowerCount)
    : null;
  const colors = [...colorBuckets.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([key, color]) => ({
      hex: `#${[color.r, color.g, color.b].map((value) => Math.round(value / color.count).toString(16).padStart(2, "0")).join("")}`,
      rgb: key.split(",").map(Number),
    }));

  return {
    composition: describeComposition(focus, horizontalBalance, verticalBalance, contrast),
    colors,
    colorDescription: describeColors(colors, mean, contrast),
    rhythm: describeRhythm(texture, contrast),
    story: tellStory(focus, colors, mean, texture),
    lyrics: writeLyrics(focus, colors, mean, texture),
  };
}

function findVisualFocus(cells, mean) {
  const scores = cells.map((cell) => {
    if (!cell.count) return null;
    const cellMean = cell.brightnessTotal / cell.count;
    const cellContrast = Math.sqrt(Math.max(0, cell.brightnessSquareTotal / cell.count - cellMean * cellMean));
    const cellTexture = cell.edgeCount ? cell.edgeTotal / cell.edgeCount : 0;
    const cellSaturation = cell.saturationTotal / cell.count;
    return Math.abs(cellMean - mean) * 0.55 + cellContrast * 0.25 + cellSaturation * 0.12 + cellTexture * 0.5;
  });
  const populatedScores = scores.filter((score) => score !== null);
  const average = populatedScores.reduce((sum, score) => sum + score, 0) / populatedScores.length;
  const focusScore = Math.max(...populatedScores);
  const focusIndex = scores.indexOf(focusScore);
  if (focusScore - average < 0.012) return "khắp bức tranh";
  return [
    "góc trên bên trái", "phía trên, lệch giữa", "góc trên bên phải",
    "phía giữa bên trái", "chính giữa", "phía giữa bên phải",
    "góc dưới bên trái", "phía dưới, lệch giữa", "góc dưới bên phải",
  ][focusIndex];
}

function describeComposition(focus, horizontalBalance, verticalBalance, contrast) {
  const focusText = focus === "khắp bức tranh"
    ? "Chưa có vùng nổi trội rõ ràng về sáng tối, tương phản hoặc độ rực màu."
    : `Vùng có độ lệch sáng, tương phản cục bộ hoặc sắc màu nổi bật hơn nằm ở ${focus}.`;
  const maximumBalance = Math.max(horizontalBalance ?? 0, verticalBalance ?? 0);
  const weight = horizontalBalance === null || verticalBalance === null
    ? ""
    : horizontalBalance < 0.04 && verticalBalance < 0.04
      ? "Ánh sáng cân bằng giữa hai nửa, tạo cảm giác ổn định."
      : maximumBalance > 0.24
        ? "Độ sáng giữa các nửa ảnh chênh lệch rõ, tạo hướng dẫn mắt."
        : maximumBalance > 0.1
        ? "Độ sáng giữa các nửa ảnh chênh lệch nhẹ, tạo hướng dẫn mắt."
        : "Ánh sáng giữa các nửa ảnh tương đối hài hòa.";
  const contrastText = contrast > 0.24
    ? "Sáng tối tương phản rõ, giúp các mảng chính dễ được nhận ra."
    : contrast < 0.13
      ? "Sáng tối dịu và gần nhau, tạo cảm giác êm, liền mạch."
      : "Sáng tối vừa phải, giữ được sự cân bằng trong tổng thể.";
  return [focusText, weight, contrastText, "Đây là nhận xét từ đặc điểm điểm ảnh, không phải nhận diện vật thể."]
    .filter(Boolean)
    .join(" ");
}

function describeColors(colors, mean, contrast) {
  const namedColors = [...new Set(colors.slice(0, 3).map(({ rgb }) => nameColor(rgb)))];
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
  return `Các màu nổi bật gồm ${namedColors.join(", ")}. Bảng màu nghiêng về sắc ${palette}, mang cảm giác ${mood}; ${depth}.`;
}

function nameColor([r, g, b]) {
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  if (maximum < 45) return "đen";
  if (minimum > 220) return "trắng";
  if (maximum - minimum < maximum * 0.16) return "xám";

  const delta = maximum - minimum;
  let hue;
  if (maximum === r) hue = 60 * (((g - b) / delta) % 6);
  else if (maximum === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;
  if (maximum < 115 && hue >= 15 && hue < 55) return "nâu";
  if (hue < 15 || hue >= 345) return "đỏ";
  if (hue < 40) return "cam";
  if (hue < 70) return "vàng";
  if (hue < 165) return "xanh lá";
  if (hue < 195) return "xanh ngọc";
  if (hue < 255) return "xanh lam";
  if (hue < 290) return "tím";
  return "hồng";
}

function describeRhythm(texture, contrast) {
  if (texture > 0.13) return "Các thay đổi sáng tối khá dày và rõ, gợi một nhịp thị giác rộn ràng, nhiều chi tiết. Phân tích ảnh không thể xác định chính xác hướng hay chất liệu nét vẽ.";
  if (texture < 0.055 && contrast < 0.18) return "Sáng tối chuyển nhẹ và ít đột ngột, tạo nhịp điệu chậm rãi, thoáng đãng như một khoảng lặng.";
  if (texture < 0.08) return "Các mảng sáng tối nối tiếp khá êm, gợi nhịp điệu mềm và thư thả.";
  return "Sáng tối thay đổi vừa phải, tạo nhịp điệu đều với một vài điểm nhấn thị giác.";
}

function tellStory(focus, colors, mean, texture) {
  const firstColor = colors[0]?.rgb ?? [140, 140, 130];
  const tone = `Gam ${nameColor(firstColor)} khẽ nhuộm màu cho câu chuyện.`;
  const pace = texture > 0.13
    ? "Nhiều chuyển động sáng tối rủ mắt ta đi qua từng vùng."
    : texture > 0.07
      ? "Các mảng sáng tối nối nhau bằng một nhịp vừa phải."
      : "Nhịp điệu thong thả mời ta dừng lại lâu hơn một chút.";
  const light = mean > 0.62 ? "Ánh sáng ở đây rộng mở, như một lời chào." : mean < 0.37 ? "Ánh sáng lắng sâu, như cất giữ một điều chưa kể." : "Ánh sáng vừa đủ dịu để mọi thứ gần nhau hơn.";
  const opening = focus === "khắp bức tranh" ? "Hãy thử nhìn khắp bức tranh." : `Hãy thử bắt đầu từ ${focus}.`;
  return `${opening} ${tone} ${light} ${pace} Có lẽ bức tranh đang thì thầm rằng: đôi khi chỉ cần chậm lại, ta sẽ nhìn thấy điều mình bỏ lỡ. Câu chuyện này được gợi ý từ sắc độ và bố cục; cảm nhận của bạn vẫn là điều quan trọng nhất.`;
}

function writeLyrics(focus, colors, mean, texture) {
  const firstColor = colors[0]?.rgb ?? [140, 140, 130];
  const colorLine = `Sắc ${nameColor(firstColor)} ngân nga thành lời.`;
  const lightLine = mean > 0.62
    ? "Nắng mở lối, chân trời xanh."
    : mean < 0.37
      ? "Bóng sâu ôm điều chưa nói."
      : "Ánh dịu khẽ chạm bờ vai.";
  const rhythmLine = texture > 0.11
    ? "Nét reo theo nhịp rộn ràng."
    : texture > 0.07
      ? "Nét nối nhịp vừa ngân vang."
      : "Nét trôi chậm giữa mênh mang.";

  const opening = focus === "khắp bức tranh"
    ? "Khắp bức tranh, câu hát khẽ ngân,"
    : `Từ ${focus}, câu hát khẽ ngân,`;
  return `${opening}\n${colorLine}\n${lightLine}\n${rhythmLine}\nChậm thôi, chậm thôi, nghe lòng mình gần bức tranh.`;
}

function renderAnalysis(analysis) {
  currentAnalysis = analysis;
  document.querySelector("#composition-text").textContent = analysis.composition;
  document.querySelector("#color-text").textContent = analysis.colorDescription;
  document.querySelector("#rhythm-text").textContent = analysis.rhythm;
  const palette = document.querySelector("#palette");
  palette.replaceChildren(...analysis.colors.map((color, index) => {
    const swatch = document.createElement("span");
    swatch.className = "palette-swatch";
    swatch.style.backgroundColor = color.hex;
    swatch.setAttribute("aria-label", `Màu chủ đạo ${index + 1}: ${color.hex}`);
    return swatch;
  }));
  renderSelectedPerspective();
}

function renderSelectedPerspective() {
  if (!currentAnalysis) return;
  const { composition, colorDescription, rhythm, story, lyrics } = currentAnalysis;
  let spokenStory;
  switch (analysisPerspective.value) {
    case "art":
      spokenStory = `${composition} ${colorDescription} ${rhythm} Đây là những quan sát thị giác tự động; ý nghĩa của tác phẩm còn tùy thuộc vào cảm nhận của mỗi người.`;
      break;
    case "simple":
      spokenStory = `Hãy nhìn thử ${composition.toLowerCase()} ${colorDescription} ${rhythm} Bạn có thể tự hỏi: màu sắc hoặc chi tiết nào khiến mình chú ý đầu tiên?`;
      break;
    case "creative":
      spokenStory = `Gợi ý sáng tác: ${colorDescription} Thử đặt điểm nhấn ở ${composition.toLowerCase()} và tạo nhịp nét dựa trên gợi ý này: ${rhythm} Đây chỉ là bài tập tham khảo; bạn có thể biến đổi theo ý mình.`;
      break;
    default:
      spokenStory = `${story}\n\n${lyrics}`;
  }
  document.querySelector("#story-text").textContent = spokenStory;
  currentStory = `${composition} ${colorDescription} ${rhythm} Lời kể: ${spokenStory}`;
}

analysisPerspective.addEventListener("change", () => {
  renderSelectedPerspective();
  if (!stopButton.disabled) speakCurrentStory();
});

listenButton.addEventListener("click", () => {
  if (!currentStory || !("speechSynthesis" in window)) {
    showError("Thiết bị hoặc trình duyệt này chưa hỗ trợ đọc lời kể thành tiếng.");
    return;
  }
  speakCurrentStory();
});

function speakCurrentStory() {
  if (!currentStory) return;
  speechSynthesis.cancel();
  startNarrationMusic();
  const utterance = new SpeechSynthesisUtterance(currentStory);
  const selectedVoice = voiceSelect.value === "auto"
    ? vietnameseVoices[0]
    : vietnameseVoices[Number(voiceSelect.value)];
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.lang = selectedVoice?.lang ?? "vi-VN";
  utterance.rate = Number(voiceSpeed.value);
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onstart = () => {
    listenButton.disabled = true;
    stopButton.disabled = false;
  };
  utterance.onend = () => {
    listenButton.disabled = false;
    stopButton.disabled = true;
    stopNarrationMusic();
  };
  utterance.onerror = (event) => {
    if (event.error === "canceled" || event.error === "interrupted") return;
    listenButton.disabled = false;
    stopButton.disabled = true;
    stopNarrationMusic();
    showError("Không thể phát giọng đọc. Hãy kiểm tra hỗ trợ giọng tiếng Việt của thiết bị.");
  };
  speechSynthesis.speak(utterance);
}

voiceSpeed.addEventListener("change", () => {
  if (!stopButton.disabled) {
    speakCurrentStory();
  }
});

voiceSelect.addEventListener("change", () => {
  if (!stopButton.disabled) {
    speakCurrentStory();
  }
});

stopButton.addEventListener("click", () => {
  speechSynthesis.cancel();
  stopNarrationMusic();
  listenButton.disabled = false;
  stopButton.disabled = true;
});

musicToggle.addEventListener("change", () => {
  if (!musicToggle.checked) {
    stopNarrationMusic();
  } else if (!stopButton.disabled) {
    startNarrationMusic();
  }
});

function startNarrationMusic() {
  if (!musicToggle.checked) return;
  stopNarrationMusic();

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(0.3, context.currentTime + 2.5);
  master.connect(context.destination);

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  filter.Q.value = 0.35;
  filter.connect(master);

  const delay = context.createDelay(1);
  delay.delayTime.value = 0.32;
  const feedback = context.createGain();
  feedback.gain.value = 0.17;
  const delayFilter = context.createBiquadFilter();
  delayFilter.type = "lowpass";
  delayFilter.frequency.value = 1100;
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(delayFilter);
  delayFilter.connect(master);

  const progressions = [
    [130.81, 196, 261.63, 329.63],
    [110, 164.81, 220, 261.63],
    [87.31, 130.81, 174.61, 220],
    [98, 146.83, 196, 246.94],
  ];
  let chordIndex = 0;
  let activeChord = [];
  const playChord = () => {
    const now = context.currentTime;
    activeChord.forEach(({ oscillator, gain }) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.8);
      oscillator.stop(now + 4);
    });
    activeChord = progressions[chordIndex % progressions.length].map((frequency) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.018, now + 2.2);
      oscillator.connect(gain);
      gain.connect(filter);
      gain.connect(delay);
      oscillator.start(now);
      return { oscillator, gain };
    });
    chordIndex += 1;
  };

  const melody = [392, 349.23, 329.63, 261.63, 293.66, 329.63, 392, 329.63];
  let melodyIndex = 0;
  const playMelodyNote = () => {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = melody[melodyIndex % melody.length];
    melodyIndex += 1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    oscillator.connect(gain);
    gain.connect(filter);
    gain.connect(delay);
    oscillator.start(now);
    oscillator.stop(now + 2.5);
  };

  playChord();
  playMelodyNote();
  const chordTimer = window.setInterval(playChord, 9000);
  const melodyTimer = window.setInterval(playMelodyNote, 2400);
  narrationMusic = { context, master, chordTimer, melodyTimer };
  context.resume();
}

function stopNarrationMusic() {
  if (!narrationMusic) return;
  window.clearInterval(narrationMusic.chordTimer);
  window.clearInterval(narrationMusic.melodyTimer);
  const { context, master } = narrationMusic;
  narrationMusic = null;
  if (context.state === "closed") return;
  const now = context.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  window.setTimeout(() => {
    context.close().catch(() => {});
  }, 800);
}
