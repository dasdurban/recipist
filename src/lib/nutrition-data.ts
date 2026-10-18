/**
 * Bundled nutrition database (values per 100 g).
 * Kept intentionally compact so it ships inside the app: no API keys, works offline.
 * `cup` = grams in one US cup, `piece` = grams for one whole item, `can` = grams per can.
 * `groups` feed the health score (veg/fruit/legume/wholegrain are "good", the rest "rich").
 */

export interface FoodItem {
  name: string
  aliases?: string[]
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  sodium: number
  cup?: number
  piece?: number
  can?: number
  liquid?: boolean
  groups?: string[]
}

interface Opts {
  aliases?: string[]
  cup?: number
  piece?: number
  can?: number
  liquid?: boolean
  groups?: string[]
}

const F = (
  name: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  sugar: number,
  sodium: number,
  opts: Opts = {},
): FoodItem => ({ name, kcal, protein, carbs, fat, fiber, sugar, sodium, ...opts })

export const FOODS: FoodItem[] = [
  // ---- grains, flour, baking
  F('all-purpose flour', 364, 10.3, 76.3, 1, 2.7, 0.3, 2, { cup: 125, aliases: ['flour', 'plain flour', 'white flour'], groups: ['refined'] }),
  F('whole wheat flour', 340, 13.2, 71.9, 2.5, 10.7, 0.4, 2, { cup: 120, aliases: ['wholemeal flour'], groups: ['wholegrain'] }),
  F('breadcrumbs', 395, 13.4, 72, 5.3, 4.5, 6.2, 732, { cup: 108, aliases: ['panko'], groups: ['refined'] }),
  F('rolled oats', 389, 16.9, 66.3, 6.9, 10.6, 0, 2, { cup: 90, aliases: ['oats', 'oatmeal'], groups: ['wholegrain'] }),
  F('cornstarch', 381, 0.3, 91.3, 0.1, 0.9, 0, 9, { cup: 128, aliases: ['corn flour'], groups: ['refined'] }),
  F('white rice', 130, 2.7, 28, 0.3, 0.4, 0.1, 1, { cup: 158, groups: ['refined'] }),
  F('brown rice', 123, 2.7, 25.6, 1, 1.6, 0.2, 4, { cup: 195, groups: ['wholegrain'] }),
  F('pasta', 158, 5.8, 31, 0.9, 1.8, 0.6, 1, { cup: 140, aliases: ['spaghetti', 'penne', 'macaroni', 'noodles'], groups: ['refined'] }),
  F('quinoa', 120, 4.4, 21.3, 1.9, 2.8, 0.9, 7, { cup: 185, groups: ['wholegrain'] }),
  F('couscous', 112, 3.8, 23.2, 0.2, 1.4, 0.1, 5, { cup: 157, groups: ['refined'] }),
  F('bread', 265, 9, 49, 3.2, 2.7, 5, 491, { piece: 28, aliases: ['slice of bread', 'sandwich bread'], groups: ['refined'] }),
  F('flour tortilla', 304, 8, 50, 7.9, 3.5, 2.7, 802, { piece: 49, aliases: ['tortilla', 'wrap'], groups: ['refined'] }),
  F('corn tortilla', 218, 5.7, 45, 2.9, 6.3, 0.8, 4, { piece: 26, groups: ['wholegrain'] }),
  F('pizza dough', 275, 9, 53, 2.5, 2, 1.5, 500, { piece: 250, groups: ['refined'] }),
  F('yeast', 325, 40.4, 41.2, 7.6, 26.9, 0, 51, { groups: ['processed'] }),

  // ---- sugars & sweeteners
  F('granulated sugar', 387, 0, 100, 0, 0, 100, 1, { cup: 200, aliases: ['sugar', 'white sugar', 'caster sugar'], groups: ['added-sugar'] }),
  F('brown sugar', 380, 0, 98, 0, 0, 97, 28, { cup: 220, groups: ['added-sugar'] }),
  F('powdered sugar', 389, 0, 99.8, 0, 0, 99, 1, { cup: 120, aliases: ['confectioners sugar', 'icing sugar'], groups: ['added-sugar'] }),
  F('honey', 304, 0.3, 82.4, 0, 0.2, 82.1, 4, { cup: 340, groups: ['added-sugar'] }),
  F('maple syrup', 260, 0, 67, 0.1, 0, 60, 12, { cup: 322, groups: ['added-sugar'] }),
  F('molasses', 290, 0, 74.7, 0.1, 0, 74.7, 37, { cup: 337, groups: ['added-sugar'] }),

  // ---- fats & oils
  F('butter', 717, 0.9, 0.1, 81.1, 0, 0.1, 11, { cup: 227, liquid: false, groups: ['rich-fat'] }),
  F('olive oil', 884, 0, 0, 100, 0, 0, 2, { cup: 216, liquid: true, groups: ['rich-fat'] }),
  F('vegetable oil', 884, 0, 0, 100, 0, 0, 0, { cup: 218, liquid: true, aliases: ['canola oil', 'sunflower oil', 'oil'], groups: ['rich-fat'] }),
  F('coconut oil', 892, 0, 0, 99, 0, 0, 0, { cup: 218, groups: ['rich-fat'] }),
  F('sesame oil', 884, 0, 0, 100, 0, 0, 0, { cup: 216, liquid: true, groups: ['rich-fat'] }),
  F('mayonnaise', 680, 1, 0.6, 75, 0, 0.6, 635, { cup: 220, groups: ['rich-fat', 'processed'] }),
  F('shortening', 884, 0, 0, 100, 0, 0, 0, { cup: 191, groups: ['rich-fat'] }),

  // ---- dairy & eggs
  F('whole milk', 61, 3.2, 4.8, 3.3, 0, 5.1, 43, { cup: 244, liquid: true, aliases: ['milk'], groups: ['dairy'] }),
  F('2% milk', 50, 3.3, 4.8, 2, 0, 5.1, 44, { cup: 244, liquid: true, aliases: ['low fat milk', 'reduced fat milk'], groups: ['dairy'] }),
  F('skim milk', 34, 3.4, 5, 0.1, 0, 5.1, 42, { cup: 245, liquid: true, aliases: ['nonfat milk'], groups: ['dairy'] }),
  F('heavy cream', 340, 2.8, 2.8, 36.1, 0, 2.9, 38, { cup: 238, liquid: true, aliases: ['heavy whipping cream', 'cream'], groups: ['dairy', 'rich-fat'] }),
  F('sour cream', 198, 2.4, 4.6, 19.4, 0, 3.4, 31, { cup: 230, groups: ['dairy', 'rich-fat'] }),
  F('greek yogurt', 59, 10, 3.6, 0.4, 0, 3.2, 36, { cup: 245, aliases: ['plain yogurt', 'yogurt', 'yoghurt'], groups: ['dairy'] }),
  F('cream cheese', 342, 6.2, 4.1, 34, 0, 3.2, 314, { cup: 232, groups: ['dairy', 'rich-fat'] }),
  F('cheddar cheese', 403, 25, 1.3, 33, 0, 0.5, 621, { cup: 113, aliases: ['cheese', 'shredded cheese'], groups: ['dairy', 'rich-fat'] }),
  F('parmesan', 431, 38, 4.1, 29, 0, 0.9, 1529, { cup: 100, aliases: ['parmigiano', 'parmesan cheese'], groups: ['dairy', 'rich-fat'] }),
  F('mozzarella', 300, 22, 2.2, 22, 0, 1, 627, { cup: 112, groups: ['dairy', 'rich-fat'] }),
  F('feta', 264, 14, 4.1, 21, 0, 4.1, 917, { cup: 150, groups: ['dairy', 'rich-fat'] }),
  F('ricotta', 174, 11, 3, 13, 0, 0.3, 84, { cup: 246, groups: ['dairy'] }),
  F('egg', 143, 12.6, 0.7, 9.5, 0, 0.4, 142, { piece: 50, aliases: ['eggs', 'large egg'], groups: ['protein'] }),
  F('egg white', 52, 10.9, 0.7, 0.2, 0, 0.7, 166, { piece: 33, groups: ['protein'] }),

  // ---- meat, poultry, fish
  F('chicken breast', 165, 31, 0, 3.6, 0, 0, 74, { groups: ['protein'] }),
  F('chicken thigh', 209, 26, 0, 10.9, 0, 0, 88, { groups: ['protein'] }),
  F('chicken', 215, 27, 0, 11, 0, 0, 82, { aliases: ['chicken thighs', 'rotisserie chicken'], groups: ['protein'] }),
  F('ground beef', 250, 26, 0, 15, 0, 0, 75, { aliases: ['hamburger meat', 'minced beef', 'beef mince'], groups: ['protein', 'rich-fat'] }),
  F('lean ground beef', 176, 20, 0, 10, 0, 0, 66, { groups: ['protein'] }),
  F('beef', 271, 25, 0, 19, 0, 0, 54, { aliases: ['steak', 'chuck roast', 'stew meat'], groups: ['protein'] }),
  F('pork', 231, 26, 0, 14, 0, 0, 62, { aliases: ['pork chop', 'pork loin', 'pork shoulder'], groups: ['protein'] }),
  F('bacon', 541, 37, 1.4, 42, 0, 0, 1717, { piece: 8, aliases: ['bacon strips'], groups: ['processed', 'rich-fat'] }),
  F('ham', 145, 21, 1.5, 5.5, 0, 0.8, 1200, { groups: ['processed', 'protein'] }),
  F('sausage', 301, 12, 2, 27, 0, 2, 848, { piece: 68, aliases: ['sausages', 'italian sausage'], groups: ['processed', 'rich-fat'] }),
  F('salmon', 208, 20, 0, 13, 0, 0, 59, { aliases: ['salmon fillet'], groups: ['protein'] }),
  F('tuna', 116, 25.5, 0, 0.8, 0, 0, 247, { can: 142, aliases: ['canned tuna'], groups: ['protein'] }),
  F('shrimp', 99, 24, 0.2, 0.3, 0, 0, 111, { piece: 15, aliases: ['prawns'], groups: ['protein'] }),
  F('cod', 82, 18, 0, 0.7, 0, 0, 54, { aliases: ['white fish', 'tilapia'], groups: ['protein'] }),
  F('turkey', 203, 27, 0, 10, 0, 0, 78, { aliases: ['ground turkey', 'turkey breast'], groups: ['protein'] }),

  // ---- plant proteins
  F('tofu', 76, 8, 1.9, 4.8, 0.3, 0.6, 7, { groups: ['protein', 'legume'] }),
  F('tempeh', 192, 20, 7.6, 11, 0, 0, 9, { groups: ['protein', 'legume'] }),
  F('lentils', 116, 9, 20, 0.4, 7.9, 1.8, 2, { cup: 198, groups: ['legume'] }),
  F('chickpeas', 164, 8.9, 27.4, 2.6, 7.6, 4.8, 7, { cup: 164, aliases: ['garbanzo beans', 'garbanzo'], groups: ['legume'] }),
  F('black beans', 132, 8.9, 23.7, 0.5, 8.7, 0.3, 2, { cup: 172, groups: ['legume'] }),
  F('kidney beans', 127, 8.7, 22.8, 0.5, 6.4, 0.3, 1, { cup: 177, aliases: ['red beans'], groups: ['legume'] }),
  F('white beans', 139, 9.7, 25.1, 0.4, 6.3, 0.3, 6, { cup: 179, aliases: ['cannellini beans', 'great northern beans'], groups: ['legume'] }),

  // ---- vegetables
  F('onion', 40, 1.1, 9.3, 0.1, 1.7, 4.2, 4, { piece: 110, aliases: ['yellow onion', 'red onion', 'white onion'], groups: ['veg'] }),
  F('garlic', 149, 6.4, 33, 0.5, 2.1, 1, 17, { piece: 3, aliases: ['garlic clove', 'cloves garlic'], groups: ['veg'] }),
  F('tomato', 18, 0.9, 3.9, 0.2, 1.2, 2.6, 5, { piece: 123, aliases: ['tomatoes', 'roma tomato', 'cherry tomatoes'], groups: ['veg'] }),
  F('tomato sauce', 29, 1.6, 5.3, 0.4, 1.5, 3.6, 11, { cup: 245, aliases: ['marinara', 'pasta sauce'], groups: ['veg'] }),
  F('tomato paste', 82, 4.3, 18.9, 0.5, 4.1, 12.2, 59, { cup: 262, groups: ['veg'] }),
  F('bell pepper', 31, 1, 6, 0.3, 2.1, 4.2, 4, { piece: 119, aliases: ['red pepper', 'green pepper', 'capsicum'], groups: ['veg'] }),
  F('jalapeno', 29, 0.9, 6.5, 0.4, 2.8, 4.1, 3, { piece: 14, aliases: ['jalapeno pepper', 'chili', 'chile'], groups: ['veg'] }),
  F('carrot', 41, 0.9, 9.6, 0.2, 2.8, 4.7, 69, { piece: 61, aliases: ['carrots'], groups: ['veg'] }),
  F('celery', 16, 0.7, 3, 0.2, 1.6, 1.3, 80, { piece: 40, aliases: ['celery stalk'], groups: ['veg'] }),
  F('cucumber', 15, 0.7, 3.6, 0.1, 0.5, 1.7, 2, { groups: ['veg'] }),
  F('lettuce', 15, 1.4, 2.9, 0.2, 1.3, 0.8, 28, { aliases: ['romaine', 'iceberg'], groups: ['veg'] }),
  F('spinach', 23, 2.9, 3.6, 0.4, 2.2, 0.4, 79, { groups: ['veg'] }),
  F('kale', 49, 4.3, 8.8, 0.9, 3.6, 2.3, 38, { groups: ['veg'] }),
  F('broccoli', 34, 2.8, 6.6, 0.4, 2.6, 1.7, 33, { groups: ['veg'] }),
  F('cauliflower', 25, 1.9, 5, 0.3, 2, 1.9, 30, { groups: ['veg'] }),
  F('mushroom', 22, 3.1, 3.3, 0.3, 1, 2, 5, { piece: 18, aliases: ['mushrooms', 'cremini', 'button mushrooms'], groups: ['veg'] }),
  F('zucchini', 17, 1.2, 3.1, 0.3, 1, 2.5, 8, { groups: ['veg'] }),
  F('corn', 86, 3.2, 18.7, 1.2, 2, 6.3, 15, { cup: 154, aliases: ['sweetcorn', 'corn kernels'], groups: ['veg'] }),
  F('green peas', 81, 5.4, 14.5, 0.4, 5.1, 5.7, 5, { cup: 145, aliases: ['peas'], groups: ['veg', 'legume'] }),
  F('green beans', 31, 1.8, 7, 0.2, 3.4, 3.3, 6, { cup: 100, groups: ['veg'] }),
  F('potato', 77, 2, 17.5, 0.1, 2.2, 0.8, 6, { piece: 173, aliases: ['potatoes', 'russet potato'], groups: ['veg'] }),
  F('sweet potato', 86, 1.6, 20.1, 0.1, 3, 4.2, 55, { piece: 130, groups: ['veg'] }),

  // ---- fruit
  F('avocado', 160, 2, 8.5, 14.7, 6.7, 0.7, 7, { piece: 150, groups: ['fruit'] }),
  F('banana', 89, 1.1, 22.8, 0.3, 2.6, 12.2, 1, { piece: 118, aliases: ['bananas'], groups: ['fruit'] }),
  F('apple', 52, 0.3, 13.8, 0.2, 2.4, 10.4, 1, { piece: 182, aliases: ['apples'], groups: ['fruit'] }),
  F('orange', 47, 0.9, 11.8, 0.1, 2.4, 9.4, 0, { piece: 131, aliases: ['orange zest', 'oranges'], groups: ['fruit'] }),
  F('lemon', 29, 1.1, 9.3, 0.3, 2.8, 2.5, 2, { piece: 58, aliases: ['lemon juice', 'lemon zest'], groups: ['fruit'] }),
  F('lime', 30, 0.7, 10.5, 0.2, 2.8, 1.7, 2, { piece: 67, aliases: ['lime juice', 'lime zest'], groups: ['fruit'] }),
  F('strawberry', 32, 0.7, 7.7, 0.3, 2, 4.9, 1, { cup: 152, aliases: ['strawberries'], groups: ['fruit'] }),
  F('blueberry', 57, 0.7, 14.5, 0.3, 2.4, 10, 1, { cup: 148, aliases: ['blueberries'], groups: ['fruit'] }),
  F('raspberry', 52, 1.2, 11.9, 0.7, 6.5, 4.4, 1, { cup: 123, aliases: ['raspberries'], groups: ['fruit'] }),
  F('grapes', 69, 0.7, 18.1, 0.2, 0.9, 15.5, 2, { cup: 151, groups: ['fruit'] }),
  F('pineapple', 50, 0.5, 13.1, 0.1, 1.4, 9.9, 1, { cup: 165, groups: ['fruit'] }),
  F('mango', 60, 0.8, 15, 0.4, 1.6, 13.7, 1, { cup: 165, groups: ['fruit'] }),
  F('peach', 39, 0.9, 9.5, 0.3, 1.5, 3.3, 0, { piece: 150, groups: ['fruit'] }),

  // ---- nuts, seeds, chocolate
  F('peanut butter', 588, 25, 20, 50, 6, 9, 429, { cup: 258, groups: ['rich-fat'] }),
  F('almonds', 579, 21.2, 21.6, 49.9, 12.5, 4.4, 1, { cup: 143, aliases: ['almond'], groups: ['nut'] }),
  F('walnuts', 654, 15.2, 13.7, 65.2, 6.7, 2.6, 2, { cup: 117, aliases: ['walnut'], groups: ['nut'] }),
  F('pecans', 691, 9.2, 13.9, 72, 9.6, 4, 0, { cup: 109, aliases: ['pecan'], groups: ['nut'] }),
  F('cashews', 553, 18.2, 30.2, 43.9, 3.3, 5.9, 12, { cup: 137, aliases: ['cashew'], groups: ['nut'] }),
  F('peanuts', 567, 25.8, 16.1, 49.2, 8.5, 4.7, 18, { cup: 146, groups: ['nut'] }),
  F('chia seeds', 486, 16.5, 42.1, 30.7, 34.4, 0, 16, { groups: ['nut'] }),
  F('flaxseed', 534, 18.3, 28.9, 42.2, 27.3, 1.6, 30, { aliases: ['flax'], groups: ['nut'] }),
  F('sunflower seeds', 584, 20.8, 20, 51.5, 8.6, 2.6, 9, { groups: ['nut'] }),
  F('sesame seeds', 573, 17.7, 23.4, 49.7, 11.8, 0.3, 11, { groups: ['nut'] }),
  F('chocolate chips', 479, 4.2, 63.9, 29.6, 5.9, 51, 9, { cup: 170, aliases: ['chocolate', 'semisweet chocolate', 'dark chocolate'], groups: ['added-sugar', 'rich-fat'] }),
  F('cocoa powder', 228, 19.6, 57.9, 13.7, 33.2, 1.8, 21, { cup: 85, aliases: ['unsweetened cocoa'], groups: ['processed'] }),

  // ---- condiments, sauces, pantry
  F('vanilla extract', 288, 0.1, 12.7, 0.1, 0, 12.7, 9, { liquid: true, groups: ['processed', 'seasoning'] }),
  F('baking powder', 53, 0, 27.7, 0, 0, 0, 10600, { groups: ['processed', 'seasoning'] }),
  F('baking soda', 0, 0, 0, 0, 0, 0, 27360, { groups: ['processed', 'seasoning'] }),
  F('salt', 0, 0, 0, 0, 0, 0, 38758, { groups: ['processed', 'seasoning'] }),
  F('black pepper', 251, 10.4, 63.9, 3.3, 25.3, 0.6, 20, { groups: ['processed', 'seasoning'] }),
  F('soy sauce', 53, 8.1, 4.9, 0.6, 0.8, 0.4, 5493, { liquid: true, aliases: ['tamari'], groups: ['processed'] }),
  F('ketchup', 101, 1.1, 25.8, 0.1, 0.3, 21.8, 907, { cup: 240, groups: ['processed', 'added-sugar'] }),
  F('mustard', 66, 4.4, 5.8, 3.3, 3.3, 0.4, 1135, { groups: ['processed'] }),
  F('vinegar', 21, 0, 0.9, 0, 0, 0.4, 8, { liquid: true, aliases: ['balsamic vinegar', 'apple cider vinegar', 'white vinegar'], groups: ['processed'] }),
  F('salsa', 36, 1.5, 7, 0.2, 1.4, 4, 500, { cup: 240, groups: ['veg'] }),
  F('coconut milk', 230, 2.3, 5.5, 23.8, 2.2, 3.3, 15, { cup: 240, liquid: true, groups: ['rich-fat'] }),
  F('chicken broth', 4, 0.5, 0.4, 0.1, 0, 0.2, 343, { cup: 240, liquid: true, aliases: ['chicken stock', 'stock', 'broth'], groups: ['processed'] }),
  F('vegetable broth', 5, 0.2, 1, 0.1, 0, 0.5, 300, { cup: 240, liquid: true, aliases: ['vegetable stock'], groups: ['processed'] }),
  F('white wine', 82, 0.1, 2.6, 0, 0, 0.8, 5, { cup: 235, liquid: true, groups: ['processed'] }),
  F('water', 0, 0, 0, 0, 0, 0, 0, { cup: 237, liquid: true, aliases: ['ice water'], groups: ['water'] }),
  F('cream of mushroom soup', 66, 1.4, 9, 2.8, 0.3, 2.2, 600, { can: 305, groups: ['processed'] }),
  F('tortilla chips', 489, 7, 62, 24, 4, 1, 422, { groups: ['processed', 'refined'] }),
  F('potato chips', 536, 7, 53, 35, 4.8, 0.3, 525, { groups: ['processed', 'rich-fat'] }),
]

/** Common volume unit -> millilitres. */
export const VOLUME_ML: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  millilitre: 1,
  cc: 1,
  l: 1000,
  liter: 1000,
  litre: 1000,
  tsp: 4.92892,
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  'fl oz': 29.5735,
  'fluid ounce': 29.5735,
  'fluid ounces': 29.5735,
  cup: 236.588,
  cups: 236.588,
  pint: 473.176,
  pints: 473.176,
  quart: 946.353,
  quarts: 946.353,
  gallon: 3785.41,
  gallons: 3785.41,
}

/** Common weight unit -> grams. */
export const WEIGHT_G: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  gramme: 1,
  grammes: 1,
  kg: 1000,
  kilo: 1000,
  kilogram: 1000,
  kilograms: 1000,
  mg: 0.001,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
}

/** Count-style units -> which FoodItem weight to use. */
export const COUNT_UNITS = new Set([
  'piece',
  'pieces',
  'whole',
  'clove',
  'cloves',
  'slice',
  'slices',
  'stalk',
  'stalks',
  'stick',
  'sticks',
  'bunch',
  'bunches',
  'head',
  'heads',
  'can',
  'cans',
  'jar',
  'jars',
  'package',
  'packages',
  'pkg',
  'pinch',
  'dash',
  'handful',
  'sprig',
  'sprigs',
])
