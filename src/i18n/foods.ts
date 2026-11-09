import type { Lang } from "../../shared/languages.ts";

// Translated names for the built-in food list in src/lib/foods.ts, in the same
// order as its ROWS. English names live in foods.ts itself.
type Translated = Exclude<Lang, "en">;

export const FOOD_NAMES: Record<Translated, readonly string[]> = {
  vi: [
    "Táo", "Chuối", "Cam", "Dâu tây", "Việt quất", "Quả bơ", "Trứng luộc", "Trứng bác",
    "Cháo yến mạch", "Sữa chua Hy Lạp không đường", "Sữa tươi ít béo 2%", "Bánh mì nguyên cám",
    "Bánh mì sandwich trắng", "Bánh mì bagel", "Bơ đậu phộng", "Bơ lạt", "Dầu ô liu", "Cơm trắng",
    "Cơm gạo lứt", "Mì Ý (đã nấu)", "Hạt diêm mạch (quinoa)", "Khoai tây nướng", "Khoai tây chiên",
    "Ức gà nướng", "Cá hồi nướng", "Cá ngừ đóng hộp", "Bít tết thăn bò", "Thịt bò xay (đã nấu)",
    "Đậu phụ", "Đậu đen (đã nấu)", "Đậu lăng (đã nấu)", "Bông cải xanh hấp", "Salad rau xanh",
    "Salad Caesar", "Phô mai cheddar", "Hạnh nhân", "Pizza phô mai", "Hamburger", "Burrito gà",
    "Sushi cuộn cá hồi", "Bánh quy sô-cô-la chip", "Sô-cô-la đen 70%", "Cà phê đen",
    "Latte sữa tươi", "Nước cam", "Nước ngọt cola", "Bia", "Rượu vang đỏ", "Sữa whey protein",
  ],
  es: [
    "Manzana", "Plátano", "Naranja", "Fresas", "Arándanos", "Aguacate", "Huevo cocido",
    "Huevos revueltos", "Avena cocida", "Yogur griego natural desnatado", "Leche semidesnatada 2%",
    "Pan integral", "Pan blanco", "Bagel natural", "Mantequilla de cacahuete", "Mantequilla",
    "Aceite de oliva", "Arroz blanco cocido", "Arroz integral cocido", "Pasta cocida",
    "Quinoa cocida", "Patata asada", "Patatas fritas", "Pechuga de pollo a la plancha",
    "Salmón al horno", "Atún al natural (lata)", "Filete de solomillo de ternera",
    "Carne picada de ternera 85%, cocinada", "Tofu firme", "Frijoles negros cocidos",
    "Lentejas cocidas", "Brócoli al vapor", "Ensalada verde mixta", "Ensalada César",
    "Queso cheddar", "Almendras", "Pizza de queso", "Hamburguesa", "Burrito de pollo",
    "Sushi, rollo de salmón", "Galleta con chispas de chocolate", "Chocolate negro 70%",
    "Café solo", "Café con leche entera (latte)", "Zumo de naranja", "Refresco de cola",
    "Cerveza", "Vino tinto", "Batido de proteína (whey)",
  ],
  pt: [
    "Maçã", "Banana", "Laranja", "Morangos", "Mirtilos", "Abacate", "Ovo cozido", "Ovos mexidos",
    "Mingau de aveia", "Iogurte grego natural desnatado", "Leite semidesnatado 2%", "Pão integral",
    "Pão de forma branco", "Bagel simples", "Pasta de amendoim", "Manteiga", "Azeite de oliva",
    "Arroz branco cozido", "Arroz integral cozido", "Macarrão cozido", "Quinoa cozida",
    "Batata assada", "Batata frita", "Peito de frango grelhado", "Salmão assado",
    "Atum em lata (em água)", "Bife de alcatra", "Carne moída 85%, cozida", "Tofu firme",
    "Feijão preto cozido", "Lentilha cozida", "Brócolis no vapor", "Salada verde mista",
    "Salada Caesar", "Queijo cheddar", "Amêndoas", "Pizza de queijo", "Hambúrguer",
    "Burrito de frango", "Sushi, uramaki de salmão", "Cookie com gotas de chocolate",
    "Chocolate amargo 70%", "Café preto", "Café com leite integral (latte)", "Suco de laranja",
    "Refrigerante de cola", "Cerveja", "Vinho tinto", "Shake de proteína (whey)",
  ],
  fr: [
    "Pomme", "Banane", "Orange", "Fraises", "Myrtilles", "Avocat", "Œuf dur", "Œufs brouillés",
    "Porridge d'avoine", "Yaourt grec nature 0 %", "Lait demi-écrémé", "Pain complet",
    "Pain de mie blanc", "Bagel nature", "Beurre de cacahuète", "Beurre", "Huile d'olive",
    "Riz blanc cuit", "Riz complet cuit", "Pâtes cuites", "Quinoa cuit", "Pomme de terre au four",
    "Frites", "Blanc de poulet grillé", "Saumon au four", "Thon au naturel (boîte)",
    "Steak de faux-filet", "Bœuf haché 15 % MG, cuit", "Tofu ferme", "Haricots noirs cuits",
    "Lentilles cuites", "Brocoli vapeur", "Salade verte mélangée", "Salade César", "Cheddar",
    "Amandes", "Pizza au fromage", "Hamburger", "Burrito au poulet", "Sushi, maki au saumon",
    "Cookie aux pépites de chocolat", "Chocolat noir 70 %", "Café noir", "Latte au lait entier",
    "Jus d'orange", "Cola", "Bière", "Vin rouge", "Shake protéiné (whey)",
  ],
  de: [
    "Apfel", "Banane", "Orange", "Erdbeeren", "Heidelbeeren", "Avocado", "Ei, gekocht", "Rührei",
    "Haferbrei", "Griechischer Joghurt, natur, fettfrei", "Milch, 2 % Fett", "Vollkornbrot",
    "Weißbrot", "Bagel, natur", "Erdnussbutter", "Butter", "Olivenöl", "Weißer Reis, gekocht",
    "Naturreis, gekocht", "Nudeln, gekocht", "Quinoa, gekocht", "Ofenkartoffel", "Pommes frites",
    "Hähnchenbrust, gegrillt", "Lachs, gebacken", "Thunfisch im eigenen Saft (Dose)",
    "Rumpsteak", "Rinderhackfleisch 85 %, gegart", "Tofu, fest", "Schwarze Bohnen, gekocht",
    "Linsen, gekocht", "Brokkoli, gedämpft", "Gemischter grüner Salat", "Caesar Salad",
    "Cheddar-Käse", "Mandeln", "Käsepizza", "Hamburger", "Hähnchen-Burrito", "Sushi, Lachsrolle",
    "Schokoladenkeks", "Zartbitterschokolade 70 %", "Schwarzer Kaffee", "Latte mit Vollmilch",
    "Orangensaft", "Cola", "Bier", "Rotwein", "Proteinshake (Whey)",
  ],
  zh: [
    "苹果", "香蕉", "橙子", "草莓", "蓝莓", "牛油果", "水煮蛋", "炒鸡蛋", "燕麦粥",
    "希腊酸奶（原味脱脂）", "低脂牛奶（2%）", "全麦面包", "白面包", "原味贝果", "花生酱", "黄油",
    "橄榄油", "白米饭", "糙米饭", "意大利面（熟）", "藜麦（熟）", "烤土豆", "炸薯条", "烤鸡胸肉",
    "烤三文鱼", "水浸金枪鱼罐头", "西冷牛排", "熟牛肉末（85%瘦）", "老豆腐", "黑豆（熟）",
    "小扁豆（熟）", "清蒸西兰花", "什锦蔬菜沙拉", "凯撒沙拉", "切达奶酪", "杏仁", "芝士披萨",
    "汉堡", "鸡肉卷饼", "三文鱼寿司卷", "巧克力豆曲奇", "70%黑巧克力", "黑咖啡", "全脂拿铁",
    "橙汁", "可乐", "啤酒", "红葡萄酒", "蛋白粉奶昔（乳清）",
  ],
  ja: [
    "りんご", "バナナ", "オレンジ", "いちご", "ブルーベリー", "アボカド", "ゆで卵",
    "スクランブルエッグ", "オートミール", "ギリシャヨーグルト（無糖・無脂肪）", "低脂肪牛乳（2%）",
    "全粒粉パン", "食パン", "プレーンベーグル", "ピーナッツバター", "バター", "オリーブオイル",
    "白ご飯", "玄米ご飯", "パスタ（ゆで）", "キヌア（炊いたもの）", "ベイクドポテト",
    "フライドポテト", "鶏むね肉のグリル", "焼き鮭", "ツナ缶（水煮）", "サーロインステーキ",
    "牛ひき肉（赤身85%・加熱）", "木綿豆腐", "黒いんげん豆（ゆで）", "レンズ豆（ゆで）",
    "蒸しブロッコリー", "グリーンサラダ", "シーザーサラダ", "チェダーチーズ", "アーモンド",
    "チーズピザ", "ハンバーガー", "チキンブリトー", "サーモン巻き寿司", "チョコチップクッキー",
    "ダークチョコレート70%", "ブラックコーヒー", "カフェラテ", "オレンジジュース", "コーラ",
    "ビール", "赤ワイン", "プロテインシェイク（ホエイ）",
  ],
  ko: [
    "사과", "바나나", "오렌지", "딸기", "블루베리", "아보카도", "삶은 달걀", "스크램블드에그",
    "오트밀", "그릭요거트(무가당 무지방)", "저지방 우유(2%)", "통밀빵", "식빵", "플레인 베이글",
    "땅콩버터", "버터", "올리브유", "흰쌀밥", "현미밥", "파스타(삶은 것)", "퀴노아(조리)",
    "구운 감자", "감자튀김", "닭가슴살 구이", "연어 구이", "참치 통조림(물)", "등심 스테이크",
    "소고기 다짐육(85%, 조리)", "두부(단단한 것)", "검은콩(삶은 것)", "렌틸콩(삶은 것)",
    "찐 브로콜리", "그린 샐러드", "시저 샐러드", "체다 치즈", "아몬드", "치즈 피자", "햄버거",
    "치킨 부리토", "연어 롤 초밥", "초코칩 쿠키", "다크 초콜릿 70%", "블랙커피", "카페라테",
    "오렌지 주스", "콜라", "맥주", "레드 와인", "단백질 쉐이크(유청)",
  ],
};

// English portion → [vi, es, pt, fr, de, zh, ja, ko]. Ounces become metric outside English.
const PORTION_ROWS: [string, ...string[]][] = [
  ["1 medium", "1 (cỡ vừa)", "1 mediano", "1 médio", "1 moyen", "1 mittelgroß", "1个（中等）", "中1個", "중간 크기 1개"],
  ["1 cup", "1 cốc", "1 taza", "1 xícara", "1 tasse", "1 Tasse", "1杯", "1カップ", "1컵"],
  ["1/2 fruit", "1/2 quả", "1/2 pieza", "1/2 fruta", "1/2 fruit", "1/2 Frucht", "半个", "1/2個", "1/2개"],
  ["1 large", "1 quả lớn", "1 grande", "1 grande", "1 gros", "1 groß", "1个（大）", "大1個", "큰 것 1개"],
  ["2 eggs", "2 quả trứng", "2 huevos", "2 ovos", "2 œufs", "2 Eier", "2个鸡蛋", "卵2個", "달걀 2개"],
  ["170 g cup", "1 hộp 170 g", "1 vaso de 170 g", "1 pote de 170 g", "1 pot de 170 g", "1 Becher (170 g)", "1杯（170克）", "1カップ（170 g）", "1컵(170g)"],
  ["1 slice", "1 lát", "1 porción", "1 fatia", "1 tranche", "1 Scheibe", "1片", "1枚", "1조각"],
  ["2 tbsp", "2 muỗng canh", "2 cucharadas", "2 colheres de sopa", "2 c. à soupe", "2 EL", "2汤匙", "大さじ2", "2큰술"],
  ["1 tbsp", "1 muỗng canh", "1 cucharada", "1 colher de sopa", "1 c. à soupe", "1 EL", "1汤匙", "大さじ1", "1큰술"],
  ["medium serving", "1 phần vừa", "ración mediana", "porção média", "portion moyenne", "mittlere Portion", "中份", "Mサイズ", "중간 사이즈"],
  ["100 g", "100 g", "100 g", "100 g", "100 g", "100 g", "100克", "100 g", "100g"],
  ["1 can drained", "1 hộp (đã chắt nước)", "1 lata escurrida", "1 lata escorrida", "1 boîte égouttée", "1 Dose, abgetropft", "1罐（沥干）", "1缶（水切り）", "1캔(물기 제거)"],
  ["2 cups", "2 cốc", "2 tazas", "2 xícaras", "2 tasses", "2 Tassen", "2杯", "2カップ", "2컵"],
  ["1 bowl", "1 bát", "1 bol", "1 tigela", "1 bol", "1 Schüssel", "1碗", "1皿", "1그릇"],
  ["1 oz", "28 g", "28 g", "28 g", "28 g", "28 g", "28克", "28 g", "28g"],
  ["1 oz (23 nuts)", "28 g (23 hạt)", "28 g (23 almendras)", "28 g (23 unidades)", "28 g (23 amandes)", "28 g (23 Stück)", "28克（23粒）", "28 g（23粒）", "28g(23알)"],
  ["1 burger", "1 cái", "1 hamburguesa", "1 hambúrguer", "1 burger", "1 Burger", "1个", "1個", "1개"],
  ["1 burrito", "1 cái", "1 burrito", "1 burrito", "1 burrito", "1 Burrito", "1个", "1個", "1개"],
  ["6 pieces", "6 miếng", "6 piezas", "6 peças", "6 pièces", "6 Stück", "6块", "6貫", "6조각"],
  ["16 oz", "473 ml", "473 ml", "473 ml", "473 ml", "473 ml", "473毫升", "473 ml", "473ml"],
  ["12 oz can", "1 lon 355 ml", "1 lata de 355 ml", "1 lata de 355 ml", "1 canette de 355 ml", "1 Dose (355 ml)", "1罐（355毫升）", "1缶（355 ml）", "1캔(355ml)"],
  ["12 oz", "355 ml", "355 ml", "355 ml", "355 ml", "355 ml", "355毫升", "355 ml", "355ml"],
  ["5 oz glass", "1 ly 148 ml", "1 copa de 148 ml", "1 taça de 148 ml", "1 verre de 148 ml", "1 Glas (148 ml)", "1杯（148毫升）", "グラス1杯（148 ml）", "1잔(148ml)"],
  ["1 scoop in water", "1 muỗng pha nước", "1 cacito con agua", "1 scoop com água", "1 dose dans de l'eau", "1 Messlöffel in Wasser", "1勺（兑水）", "1スクープ（水割り）", "1스쿱(물)"],
];

const PORTION_ORDER: Translated[] = ["vi", "es", "pt", "fr", "de", "zh", "ja", "ko"];

export const PORTIONS: Record<Translated, Map<string, string>> = Object.fromEntries(
  PORTION_ORDER.map((lang, i) => [lang, new Map(PORTION_ROWS.map((row) => [row[0], row[i + 1]]))]),
) as Record<Translated, Map<string, string>>;

export const PORTION_KEYS = PORTION_ROWS.map((row) => row[0]);
