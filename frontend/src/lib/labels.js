// Traduction française des 80 classes COCO renvoyées par COCO-SSD.
const COCO_FR = {
  person: 'Personne', bicycle: 'Vélo', car: 'Voiture', motorcycle: 'Moto', airplane: 'Avion',
  bus: 'Bus', train: 'Train', truck: 'Camion', boat: 'Bateau', 'traffic light': 'Feu tricolore',
  'fire hydrant': 'Bouche d’incendie', 'stop sign': 'Panneau stop', 'parking meter': 'Parcmètre',
  bench: 'Banc', bird: 'Oiseau', cat: 'Chat', dog: 'Chien', horse: 'Cheval', sheep: 'Mouton',
  cow: 'Vache', elephant: 'Éléphant', bear: 'Ours', zebra: 'Zèbre', giraffe: 'Girafe',
  backpack: 'Sac à dos', umbrella: 'Parapluie', handbag: 'Sac à main', tie: 'Cravate',
  suitcase: 'Valise', frisbee: 'Frisbee', skis: 'Skis', snowboard: 'Snowboard',
  'sports ball': 'Ballon', kite: 'Cerf-volant', 'baseball bat': 'Batte de baseball',
  'baseball glove': 'Gant de baseball', skateboard: 'Skateboard', surfboard: 'Planche de surf',
  'tennis racket': 'Raquette', bottle: 'Bouteille', 'wine glass': 'Verre à vin', cup: 'Tasse',
  fork: 'Fourchette', knife: 'Couteau', spoon: 'Cuillère', bowl: 'Bol', banana: 'Banane',
  apple: 'Pomme', sandwich: 'Sandwich', orange: 'Orange', broccoli: 'Brocoli', carrot: 'Carotte',
  'hot dog': 'Hot-dog', pizza: 'Pizza', donut: 'Donut', cake: 'Gâteau', chair: 'Chaise',
  couch: 'Canapé', 'potted plant': 'Plante', bed: 'Lit', 'dining table': 'Table',
  toilet: 'Toilettes', tv: 'Écran', laptop: 'Ordinateur portable', mouse: 'Souris',
  remote: 'Télécommande', keyboard: 'Clavier', 'cell phone': 'Téléphone', microwave: 'Micro-ondes',
  oven: 'Four', toaster: 'Grille-pain', sink: 'Évier', refrigerator: 'Réfrigérateur', book: 'Livre',
  clock: 'Horloge', vase: 'Vase', scissors: 'Ciseaux', 'teddy bear': 'Ours en peluche',
  'hair drier': 'Sèche-cheveux', toothbrush: 'Brosse à dents',
}

export function labelFr(cocoClass) {
  return COCO_FR[cocoClass] ?? cocoClass
}
