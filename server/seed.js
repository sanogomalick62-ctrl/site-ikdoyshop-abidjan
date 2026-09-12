const bcrypt = require('bcryptjs');
const db = require('./db');

function seedUsers() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return console.log('Users already exist, skipping.');

  const username = process.env.SEED_ADMIN_USER || 'admin';
  const password = process.env.SEED_ADMIN_PASS || 'ChangeMe123!';
  const hash = bcrypt.hashSync(password, 10);

  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, hash, 'owner');

  console.log('----------------------------------------');
  console.log('Admin account created:');
  console.log('  Username:', username);
  console.log('  Password:', password);
  console.log('  >>> Log in and change this password immediately. <<<');
  console.log('----------------------------------------');
}

function seedContent() {
  const defaults = {
    site_name: 'IKODY SHOP',
    tagline: 'Portez le maillot. Portez le nombre.',
    hero_heading: 'Ton club. Ton nom. Ton numéro.',
    hero_subheading: 'Des maillots de football au style authentique pour ton club, ton pays et les légendes du rétro. Commande en une minute, on confirme par message.',
    about_text: "IKODY SHOP est une boutique de maillots indépendante pour les supporters qui prennent leurs couleurs au sérieux. Nous sélectionnons des maillots de club, d'équipes nationales et rétro et les livrons chez vous.",
    contact_phone: '+000 000 000 000',
    contact_email: 'hello@ikodyshop.com',
    contact_whatsapp: '+000000000000',
    contact_address: "Définissez l'adresse de votre boutique dans le panneau d'administration",
    instagram_url: '',
    facebook_url: '',
    tiktok_url: '',
    banner_message: 'Nouveaux maillots de la saison disponibles — commandez maintenant, confirmation par WhatsApp.',
    currency_symbol: '$'
  };

  const insert = db.prepare('INSERT OR IGNORE INTO site_content (key, value) VALUES (?, ?)');
  const tx = db.transaction((entries) => {
    for (const [k, v] of Object.entries(entries)) insert.run(k, v);
  });
  tx(defaults);
  console.log('Site content seeded (existing keys untouched).');
}

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (count > 0) return console.log('Products already exist, skipping.');

  const sample = [
    {
      name: 'Maillot Domicile 25/26',
      team: 'Verdano FC',
      category: 'club',
      league: 'Ligue 1',
      description: 'Couleurs domicile classiques dans un tissu de match respirant. Écusson brodé.',
      price: 64.99,
      compare_at_price: 79.99,
      sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
      stock: 40,
      image_url: '',
      featured: 1
    },
    {
      name: 'Maillot Extérieur 25/26',
      team: 'Verdano FC',
      category: 'club',
      league: 'Ligue 1',
      description: 'Édition extérieure audacieuse pour afficher ses couleurs partout.',
      price: 64.99,
      compare_at_price: null,
      sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      stock: 32,
      image_url: '',
      featured: 1
    },
    {
      name: 'Maillot Domicile Rossanera',
      team: 'AC Rossanera',
      category: 'club',
      league: 'Serie A',
      description: 'Bandes emblématiques, coupe moderne, écusson brodé haute densité.',
      price: 67.99,
      compare_at_price: null,
      sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      stock: 28,
      image_url: '',
      featured: 1
    },
    {
      name: 'Maillot Domicile Équipe Nationale',
      team: 'Équipe Nationale',
      category: 'national',
      league: '',
      description: 'Représentez votre pays le jour du match avec le maillot domicile de style officiel.',
      price: 69.99,
      compare_at_price: null,
      sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      stock: 25,
      image_url: '',
      featured: 1
    },
    {
      name: 'Édition Rétro Légendes 1996',
      team: 'Verdano FC',
      category: 'retro',
      league: 'Ligue 1',
      description: 'Coupe vintage, tissu épais façon coton, écusson d\'époque.',
      price: 74.99,
      compare_at_price: 89.99,
      sizes: JSON.stringify(['M', 'L', 'XL']),
      stock: 15,
      image_url: '',
      featured: 0
    },
    {
      name: 'T-shirt d\'Entraînement',
      team: 'Verdano FC',
      category: 'training',
      league: '',
      description: 'T-shirt d\'entraînement léger pour l\'échauffement avant match.',
      price: 34.99,
      compare_at_price: null,
      sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      stock: 60,
      image_url: '',
      featured: 0
    }
  ];

  const insert = db.prepare(`INSERT INTO products
    (name, team, category, league, description, price, compare_at_price, sizes, stock, image_url, featured)
    VALUES (@name, @team, @category, @league, @description, @price, @compare_at_price, @sizes, @stock, @image_url, @featured)`);

  const tx = db.transaction((rows) => rows.forEach(r => insert.run(r)));
  tx(sample);
  console.log('Sample products seeded.');
}

seedUsers();
seedContent();
seedProducts();
console.log('Seed complete.');
db.close();
