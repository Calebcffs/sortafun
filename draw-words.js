/* draw and guess: the built-in word list (draw.html).
 * Things you can actually draw in 80 seconds with a mouse. Lowercase, plain
 * ASCII, letters and single spaces only (the guess check normalises to that).
 * The drawer picks one of three: an easy, a medium and a hard.
 * The host can add their own words on top (or use only theirs).
 */
window.SORTAFUN_DRAW_WORDS = {
  easy: [
    "apple", "banana", "cat", "dog", "fish", "bird", "sun", "moon", "star", "tree",
    "house", "car", "boat", "ball", "hat", "shoe", "sock", "cup", "key", "book",
    "egg", "cake", "pizza", "cookie", "ice cream", "carrot", "cheese", "bread", "grapes", "cherry",
    "flower", "leaf", "cloud", "rain", "snowman", "rainbow", "heart", "eye", "nose", "hand",
    "foot", "ear", "mouth", "tooth", "smile", "clock", "chair", "table", "bed", "door",
    "window", "lamp", "phone", "pencil", "scissors", "spoon", "fork", "knife", "plate", "bottle",
    "candle", "balloon", "kite", "drum", "guitar", "bell", "gift", "crown", "ring", "glasses",
    "shirt", "pants", "dress", "umbrella", "bag", "box", "ladder", "bucket", "broom", "hammer",
    "snake", "frog", "duck", "pig", "cow", "horse", "sheep", "mouse", "lion", "bear",
    "bee", "spider", "snail", "worm", "turtle", "whale", "shark", "octopus", "crab", "owl",
    "train", "bus", "plane", "rocket", "bike", "truck", "ship", "tent", "fire", "mountain",
    "island", "beach", "river", "bridge", "castle", "ghost", "robot", "alien", "pirate", "king",
    "baby", "clown", "doctor", "cowboy", "ninja", "zombie", "vampire", "dragon", "unicorn", "monster",
    "football", "tennis", "sword", "shield", "bow", "arrow", "flag", "map", "coin", "money",
    "bone", "skull", "pumpkin", "mushroom", "cactus", "corn", "lemon", "orange", "pear", "watermelon",
    "donut", "burger", "fries", "hot dog", "taco", "sandwich", "popcorn", "lollipop", "candy", "milk",
    "tie", "glove", "scarf", "boot", "zip", "button", "sandal", "wig", "mask", "backpack"
  ],
  medium: [
    "airport", "astronaut", "avocado", "bakery", "bandage", "barbecue", "bathtub", "battery", "beard", "bee hive",
    "bicycle", "binoculars", "birthday", "blender", "bowling", "brain", "bubble", "butterfly", "cable car", "camel",
    "camera", "campfire", "canoe", "cannon", "carousel", "cat nap", "cave", "chess", "chimney", "circus",
    "cliff", "compass", "computer", "crocodile", "crossword", "cupcake", "dentist", "desert", "diamond", "dinosaur",
    "dolphin", "doorbell", "dragonfly", "eclipse", "elephant", "elevator", "envelope", "escalator", "explosion", "ferris wheel",
    "fireworks", "flamingo", "fountain", "fridge", "garage", "giraffe", "glacier", "goldfish", "gorilla", "graveyard",
    "hamster", "headphones", "hedgehog", "helicopter", "hockey", "hourglass", "igloo", "jellyfish", "jungle", "kangaroo",
    "keyboard", "koala", "lawn mower", "library", "lighthouse", "lightning", "lipstick", "lobster", "magnet", "mailbox",
    "mermaid", "microphone", "microscope", "mirror", "mosquito", "motorbike", "mummy", "necklace", "nest", "noodles",
    "ostrich", "paintbrush", "palm tree", "panda", "parachute", "parrot", "peacock", "penguin", "piano", "picnic",
    "pillow", "pineapple", "planet", "playground", "police", "pond", "porcupine", "postcard", "potato", "pyramid",
    "quicksand", "rabbit", "raccoon", "reindeer", "remote control", "rollercoaster", "sailboat", "sandcastle", "saxophone", "scarecrow",
    "seesaw", "shopping cart", "skateboard", "skeleton", "ski", "skyscraper", "sloth", "snowflake", "sock puppet", "spaceship",
    "spaghetti", "squirrel", "stapler", "submarine", "sunflower", "sunglasses", "surfing", "swing", "teapot", "telescope",
    "tornado", "toaster", "toothbrush", "tractor", "traffic light", "treasure", "trophy", "trumpet", "tsunami", "tulip",
    "vacuum", "violin", "volcano", "waffle", "waterfall", "wedding", "wheelchair", "windmill", "witch", "wizard",
    "yoyo", "zebra", "zipline", "hot air balloon", "baseball cap", "fishing rod", "treehouse", "sleeping bag", "road trip", "haircut"
  ],
  hard: [
    "anchor", "archaeologist", "avalanche", "ballerina", "blueprint", "bodyguard", "bookworm", "brainstorm", "bungee jump", "caterpillar",
    "chandelier", "chef", "cinema", "clockwork", "comedian", "constellation", "cruise ship", "daydream", "deja vu", "detective",
    "dizzy", "dream", "echo", "evolution", "fashion show", "fingerprint", "flat tire", "food chain", "gravity", "hiccup",
    "hibernate", "high five", "hitchhiker", "homework", "horoscope", "hypnotize", "insomnia", "jet lag", "karaoke", "knight",
    "laundry", "lava lamp", "lifeguard", "magician", "marathon", "meditation", "midnight", "migration", "moonwalk", "night owl",
    "nightmare", "orchestra", "origami", "overtime", "photosynthesis", "pickpocket", "pillow fight", "plot twist", "procrastinate", "quarantine",
    "recycling", "reflection", "retirement", "sandwich board", "scuba diving", "selfie", "shadow", "sleepwalking", "snore", "solar system",
    "speed bump", "stage fright", "stampede", "surprise party", "tailgate", "time machine", "tooth fairy", "traffic jam", "treadmill", "tug of war",
    "vegetarian", "ventriloquist", "virus", "whisper", "wifi", "wind chime", "wrinkle", "yawn", "zen garden", "zombie apocalypse"
  ],
};
