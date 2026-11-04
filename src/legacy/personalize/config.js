export const PRODUCTS = [
  { id: 'cover', label: 'Передня обкладинка', short: 'Обкладинка', aspect: '2480 / 3508', file: 'obkladynka', hint: 'A4 вертикально' },
  { id: 'back', label: 'Задня обкладинка', short: 'Задня', aspect: '2480 / 3508', file: 'zadnya', hint: 'A4 вертикально · місце під QR' },
  { id: 'calendar', label: 'Календарик', short: 'Календарик', aspect: '2480 / 1754', file: 'kalendar', hint: 'Половина A4 · дати кодом' },
  { id: 'stickers', label: 'Наклейки', short: 'Наклейки', aspect: '3508 / 2480', file: 'naklejky', hint: 'A4 · 2 половинки з лінією' }
];

// Порядок важливий: календарик і наклейки беруть стиль зі згенерованої обкладинки.
export const JOB_ORDER = ['cover', 'back', 'calendar', 'stickers'];

export const THEME_PRESETS = [
  { label: '🎄 Новорічна', value: 'New Year festive scene: decorated glowing fir tree, gift boxes, snowflakes, garlands, snowman, sparkling lights, cozy winter', palette: 'winter', template: true },
  { label: '🎅 Різдвяна казка', value: 'cozy magical Christmas fairytale: snowy wooden houses, lanterns, wreaths, gingerbread cookies, cute deer and bunny, warm golden glow', palette: 'winter', template: true },
  { label: '🎂 День народження — хлопчик', value: 'boy birthday party: blue and green balloons, cake with candles, gifts, confetti, race cars, dinosaurs and robots, party hats', palette: 'rainbow', template: true },
  { label: '🎂 День народження — дівчинка', value: 'girl birthday party: pink and lilac balloons, cake with candles, gifts, confetti, unicorn, butterflies, flowers, tiara', palette: 'pink', template: true },
  { label: '🎅 Святий Миколай', value: 'cozy Saint Nicholas (Святий Миколай) winter fairytale: kind St. Nicholas in red bishop robe with mitre and golden staff standing nearby, glowing lanterns, wooden window with snowy village, decorated fir trees, gift boxes, teddy bear, warm golden lights', palette: 'winter', template: true },
  { label: '🧸 Зима з плюшевим ведмедиком', value: 'sweet winter Christmas: child hugging a big plush teddy bear in knitted sweater and scarf, snowy gingerbread houses, red bows, gifts, lanterns, sparkling garlands, Saint Nicholas in the background', palette: 'winter', template: true },
  { label: '⚽ Новорічний футбол', value: 'New Year football fan: Santa hat, soccer balls, golden trophy, red scarf, gift boxes, snowy pine branches and a glowing winter village', palette: 'winter', template: true },
  { label: '🌸 Рожева зима (дівчинка)', value: 'pink winter fairytale for a girl: pink knitted hat with pompom, fluffy fur coat, plush toys, puppy or bunny, pink bows, gingerbread house, snowflakes, soft pastel pink and white glow', palette: 'pink', template: true },
  { label: '❄️ Зимова казка', value: 'cozy magical Christmas winter fairytale: snowy wooden houses, decorated fir trees, glowing lanterns, gift boxes, snowman, cute deer and bunny', palette: 'winter' },
  { label: '👑 Принцеса і замок', value: 'pink princess fairytale: sparkling castle, tiara, bows, fluffy kitten, pastel pink and gold', palette: 'pink' },
  { label: '🐯 Тигри та джунглі', value: 'sunny tropical jungle with friendly tigers and cubs, pink flowers, butterflies', palette: 'pink' },
  { label: '🚜 Техніка та роботи', value: 'construction site fun: friendly cartoon excavators, trucks, a red racing car, cute robots, gears and traffic cones', palette: 'rainbow' },
  { label: '🐶 Щенята-рятівники', value: 'brave rescue puppies team in a bright adventure world with a tall lookout tower, fire truck and helicopter (original characters)', palette: 'rainbow' },
  { label: '⚽ Футбол', value: 'football fan theme: soccer balls, goal, scarf in team colours, snowy stadium', palette: 'winter' },
  { label: '🍂 Осінній затишок', value: 'cozy autumn: orange leaves, pumpkins, warm lights, books, hot cocoa, a cat in a scarf', palette: 'autumn' }
];

export const STYLE_PRESETS = [
  { label: 'Яскравий мультяшний', value: 'vibrant glossy cartoon-poster look, saturated candy colours' },
  { label: 'Ніжні пастелі', value: 'soft pastel colours, dreamy glow, gentle gradients' },
  { label: 'Блиск і золото', value: 'sparkling glitter, golden accents, luxurious festive look' },
  { label: 'Як справжнє фото', value: 'photorealistic retouched photo look, cinematic warm lighting' }
];

export const QUALITY_OPTIONS = [
  { value: 'low', label: 'Чернетка (швидко, дешево)' },
  { value: 'medium', label: 'Стандарт' },
  { value: 'high', label: 'Висока (для друку)' }
];
