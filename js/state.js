// === グローバル状態・定数 ===

const dpr = window.devicePixelRatio || 1;
const rowHeight = 22;
let baseWidth = window.innerWidth;
let colHeaderH = 140;
let metadataH = 160;
let endX = 0;
let currentZoom = 1.0;
let numFrames = 144;
let targetFrames = 144;

let sections = [
  {type:"ACTION", x:25, cols:7, cw:32, chars:["A","B","C","D","E","F","G"]},
  {type:"SOUND",  x:0, cols:2, cw:68, chars:["S1","S2"]},
  {type:"CELL",   x:0, cols:7, cw:58, chars:["a","b","c","d","e","f","g"]},
  {type:"CAMERA", x:0, cols:3, cw:58, chars:["CAM1","CAM2","CAM3"]}
];

let metaData = { title:"", subTitle:"", scene:"", cut:"", lengthSec:"6", lengthFrame:"00", creator:"", sheetName:"sheet1", page:"1/1", memo:"" };
let isMemoExpanded = true;
let memoScrollLine = 0;
let booksData = { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} };
let customRepeats = [];

let dialogueBlocks = [];
let editingDialogueId = null;
let selectedDialogueId = null;
let dragDialogueInfo = null;

let cameraBlocks = [];
let editingCameraId = null;
let selectedCameraId = null;
let dragCameraInfo = null;

let editingBook = null;
let draggingBook = null;
let isDraggingBook = false;
let isPanelExpanded = true;
let isDraggingPanel = false;
let panelHasMoved = false;
let panelStartX = 0, panelStartY = 0;
let mouseStartX = 0, mouseStartY = 0;
let panelOffsetX = 0, panelOffsetY = 0;

let metaFields = [];
let cellData = {};
let undoStack = [];
let redoStack = [];
let selectionStart = null, selectionEnd = null, selectedMeta = null;
let isDragging = false;
let clipboard = null;
let draggedListItem = null;

// Canvas contexts （DOM 準備後に取得）
const mCtx = document.getElementById('metadataCanvas').getContext('2d');
const hCtx = document.getElementById('columnHeaderCanvas').getContext('2d');
const gCtx = document.getElementById('gridCanvas').getContext('2d');
const cellInput = document.getElementById('cellInput');
const metaInput = document.getElementById('metaInput');
const metaTextArea = document.getElementById('metaTextArea');
const bookInput = document.getElementById('bookInput');

const FIELD_MAP = { "ACTION": 0, "SOUND": 3, "CELL": 4, "CAMERA": 5 };
const REVERSE_FIELD_MAP = { 0: "ACTION", 3: "SOUND", 4: "CELL", 5: "CAMERA" };

// カメラ種別カテゴリ
const CAMERA_CATEGORIES = {
  "全て": [],
  "1. カメラワーク": ["FIX", "PAN (パン)", "PAN UP", "PAN DOWN", "TILT (ティルト)", "TU (トラックアップ)", "TB (トラックバック)", "ZI (ズームイン)", "ZO (ズームアウト)", "CU (クレーンアップ)", "CD (クレーンダウン)", "DOLLY (ドリー)", "MULTI (密着マルチ)", "FOLLOW (フォロー)", "FollowPan (フォローパン)", "Tuke Pan (目盛りパン/付けパン)", "Q TU (クイックTU)", "Q TB (クイックTB)", "D TU (デジタルTU)", "D TB (デジタルTB)", "GondolaTU (ゴンドラTU)", "GondolaTB (ゴンドラTB)", "Rotate TU (回転TU)", "Rotate TB (回転TB)", "PAN TU", "PAN TB", "Fairing (フェアリング)", "Rolling (ローリング)", "SL (スライド)", "ParsSL (パース引き)", "JumpSL (ジャンプスライド)", "Bar (直線)"],
  "2. 画面動": ["CAM SHAKE S (カメラぶれ弱)", "CAM SHAKE M (カメラぶれ中)", "CAM SHAKE L (カメラぶれ強)", "Handy S (ハンディ弱)", "Handy M (ハンディ中)", "Handy L (ハンディ強)"],
  "3. 場面転換": ["FI (フェードイン)", "FO (フェードアウト)", "WI (ホワイトイン)", "WO (ホワイトアウト)", "Focus IN (フォーカスイン)", "Focus Out (フォーカスアウト)", "OL (オーバーラップ)", "Wipe (ワイプ)", "IrisIN (アイリスイン)", "IrisOut (アイリスアウト)", "Insert (インサート)", "CutIN (カットイン)", "WipeIN (なめ出し)"],
  "4. 露出": ["BL K (黒コマ)", "W K (白コマ)", "SUBLINA (サブリナ)", "HI CON (ハイコン)", "OverEX (露出オーバー)", "UnderEX (露出アンダー)", "Wxp (ダブらし)", "Harmony (ハーモニー)"],
  "5. 透過光系": ["TFlash (透過光)", "Tflash Burst (T光バースト)", "Tflash Aura (オーラT光)", "Tflash Pinhole (ピンホールT光)", "Tflash Cross (クロスT光)", "Shadow Burst (シャドウバースト)"],
  "6. フィルター": ["DF1 (ディフュージョン弱)", "DF2 (ディフュージョン中)", "DF3 (ディフュージョン強)", "Fog1 (フォグ弱)", "Fog2 (フォグ中)", "Fog3 (フォグ強)", "WaveGlass S (波ガラス弱)", "WaveGlass M (波ガラス中)", "WaveGlass L (波ガラス強)", "Stream Filter (ストリームフィルター)", "Radial Filter (ラジアルフィルター)"],
  "7. ブラー系": ["BOKEH S (ボケ弱)", "BOKEH M (ボケ中)", "BOKEH L (ボケ強)", "Blur1 (ブラー弱)", "Blur2 (ブラー中)", "Blur3 (ブラー強)", "Stream Blur (ストリームブラー)", "Radial Blur (ラジアルブラー)", "MotionBlur1 (モーションブラー弱)", "MotionBlur2 (モーションブラー中)", "MotionBlur3 (モーションブラー強)", "Rack Focus (ピン送り)"],
  "8. 光系": ["I Light (入射光)", "Flare (フレア)", "Lens Flare (レンズフレア)", "Lens Ghost (レンズゴースト)"],
  "9. その他": ["Strobo (ストロボ)", "Strobo1 (ストロボ1)", "Strobo2 (ストロボ2)", "Para (パラ)"]
};
for (let key in CAMERA_CATEGORIES) { if (key !== "全て") CAMERA_CATEGORIES["全て"] = CAMERA_CATEGORIES["全て"].concat(CAMERA_CATEGORIES[key]); }

const VALUE_TYPE_MAP = { "fromTo": ["PAN", "PAN UP", "PAN DOWN", "TILT", "TU", "TB", "ZI", "ZO", "CU", "CD", "SL", "ParsSL", "Q TU", "Q TB", "D TU", "D TB", "GondolaTU", "GondolaTB", "Rotate TU", "Rotate TB", "PAN TU", "PAN TB", "JumpSL", "Bar", "FOLLOW", "FollowPan", "Tuke Pan", "FI", "FO", "WI", "WO"], "fromToLayers": ["OL"], "multiLayerDirection": ["MULTI", "DOLLY"], "numericFr": ["Strobo", "Strobo1", "Strobo2"], "fairing": ["Fairing"], "freeText": ["FIX", "Rolling"] };

const LABEL_MAP = { 'A': ['ア','イ','ウ','エ','オ'], 'B': ['カ','キ','ク','ケ','コ'], 'C': ['サ','シ','ス','セ','ソ'], 'D': ['タ','チ','ツ','テ','ト'], 'E': ['ナ','ニ','ヌ','ネ','ノ'], 'F': ['ハ','ヒ','フ','ヘ','ホ'], 'G': ['マ','ミ','ム','メ','モ'], 'a': ['a1','a2','a3','a4','a5'], 'DEFAULT': ['①','②','③','④','⑤'] };

const speakerColors = ['rgba(255, 99, 132, 0.25)', 'rgba(54, 162, 235, 0.25)', 'rgba(255, 206, 86, 0.25)', 'rgba(75, 192, 192, 0.25)', 'rgba(153, 102, 255, 0.25)', 'rgba(255, 159, 64, 0.25)', 'rgba(199, 199, 205, 0.25)', 'rgba(233, 30, 99, 0.25)'];

// TDTS カメラID マッピング
const TDTS_CAMERA_ID_MAP = {
    "FI": 0, "FO": 1, "WI": 2, "WO": 3, "OL": 4, "CAM SHAKE S": 5, "CAM SHAKE M": 6, "CAM SHAKE L": 7,
    "TU": 8, "TB": 9, "ZI": 10, "ZO": 11, "PAN": 12, "PAN UP": 13, "PAN DOWN": 14, "TILT": 15,
    "FOLLOW": 16, "CU": 17, "CD": 18, "DOLLY": 19, "MULTI": 20, "Fairing": 21, "SL": 22, "Strobo": 23,
    "Rotate TU": 24, "Rotate TB": 25, "Handy S": 26, "Handy M": 27, "Handy L": 28, "BL K": 29, "W K": 30,
    "SUBLINA": 31, "TFlash": 32, "HI CON": 33, "Rack Focus": 34, "OverEX": 35, "UnderEX": 36,
    "ParsSL": 37, "JumpSL": 38, "DF1": 39, "DF2": 40, "DF3": 41, "Fog1": 42, "Fog2": 43, "Fog3": 44,
    "BOKEH S": 45, "BOKEH M": 46, "BOKEH L": 47, "FIX": 48, "PAN TU": 49, "PAN TB": 50, "FollowPan": 51,
    "Rolling": 52, "Q TU": 53, "Q TB": 54, "Focus IN": 55, "Focus Out": 56, "WaveGlass S": 57,
    "WaveGlass M": 58, "WaveGlass L": 59, "Wipe": 60, "IrisIN": 61, "IrisOut": 62, "Insert": 63,
    "CutIN": 64, "Blur1": 65, "Blur2": 66, "Blur3": 67, "WipeIN": 68, "Bar": 69, "Strobo1": 70,
    "Strobo2": 71, "D TU": 72, "D TB": 73, "Tuke Pan": 74, "Stream Filter": 75, "Radial Filter": 76,
    "Stream Blur": 77, "Radial Blur": 78, "I Light": 79, "Flare": 80, "Para": 81, "Lens Flare": 82,
    "Lens Ghost": 83, "Tflash Burst": 84, "Shadow Burst": 85, "Harmony": 86, "Tflash Aura": 87,
    "Tflash Pinhole": 88, "Tflash Cross": 89, "MotionBlur1": 90, "MotionBlur2": 91, "MotionBlur3": 92,
    "GondolaTU": 93, "GondolaTB": 94, "Wxp": 95
};
const TDTS_ID_TO_CAMERA_MAP = {};
for (let k in TDTS_CAMERA_ID_MAP) TDTS_ID_TO_CAMERA_MAP[TDTS_CAMERA_ID_MAP[k]] = k;
