/**
 * Name pools for the politicians the game makes up, by language. Every politician in YourGov
 * is invented (first and last names drawn at random); none is a real person.
 */
import { FIRST, LAST } from "./data";

export type Culture = "en" | "de" | "fr" | "es" | "it" | "ja" | "hi" | "pt";

export const NAMES: Record<Culture, { first: string[]; last: string[] }> = {
  en: { first: FIRST, last: LAST },
  de: {
    first: ["Anna", "Lukas", "Sophie", "Jonas", "Lea", "Felix", "Hannah", "Maximilian", "Laura", "Paul", "Katrin", "Stefan", "Julia", "Tobias", "Sabine", "Markus", "Petra", "Andreas", "Claudia", "Matthias", "Ulrike", "Jan", "Birgit", "Florian", "Svenja", "Dirk", "Heike", "Christian", "Nadine", "Thorsten", "Miriam", "Jens"],
    last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Koch", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Braun", "Zimmermann", "Krüger", "Hartmann", "Lange", "Werner", "Krause", "Lehmann", "Köhler", "Herrmann", "Kaiser", "Fuchs", "Peters", "Vogel", "Brandt"],
  },
  fr: {
    first: ["Camille", "Louis", "Chloé", "Hugo", "Manon", "Lucas", "Léa", "Antoine", "Sophie", "Nicolas", "Claire", "Julien", "Élise", "Mathieu", "Inès", "Thomas", "Aurélie", "Pierre", "Margaux", "Olivier", "Nathalie", "Romain", "Sandrine", "Guillaume", "Amélie", "Benoît", "Céline", "François", "Hélène", "Yannick", "Fatima", "Karim"],
    last: ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier", "Morel", "Girard", "André", "Mercier", "Dupont", "Lambert", "Bonnet", "François", "Martinez", "Legrand", "Benali", "Faure"],
  },
  es: {
    first: ["Lucía", "Javier", "María", "Carlos", "Carmen", "Pablo", "Laura", "Alejandro", "Elena", "Daniel", "Sofía", "Miguel", "Paula", "Sergio", "Marta", "David", "Ana", "Jorge", "Isabel", "Diego", "Rocío", "Andrés", "Cristina", "Manuel", "Beatriz", "Fernando", "Guadalupe", "Ricardo", "Ximena", "Alberto", "Nerea", "Iker"],
    last: ["García", "Rodríguez", "González", "Fernández", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Martín", "Jiménez", "Ruiz", "Hernández", "Díaz", "Moreno", "Álvarez", "Muñoz", "Romero", "Alonso", "Gutiérrez", "Navarro", "Torres", "Domínguez", "Vázquez", "Ramos", "Gil", "Serrano", "Castillo", "Ortega", "Rubio", "Morales", "Flores"],
  },
  it: {
    first: ["Giulia", "Marco", "Francesca", "Luca", "Chiara", "Alessandro", "Sara", "Matteo", "Elena", "Andrea", "Valentina", "Lorenzo", "Martina", "Davide", "Federica", "Simone", "Alessia", "Giovanni", "Silvia", "Stefano", "Paola", "Riccardo", "Roberta", "Fabio", "Elisa", "Antonio", "Ilaria", "Paolo", "Serena", "Giorgio", "Monica", "Enrico"],
    last: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa", "Giordano", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro", "Mariani", "Rinaldi", "Caruso", "Ferrara", "Galli", "Martini", "Leone", "Longo", "Gentile"],
  },
  ja: {
    first: ["Haruto", "Yui", "Sota", "Aoi", "Yuto", "Hina", "Ren", "Sakura", "Takumi", "Mio", "Daiki", "Yuna", "Kenji", "Emi", "Hiroshi", "Naoko", "Takeshi", "Ayumi", "Kazuki", "Rin", "Shota", "Misaki", "Ryo", "Kaori", "Yusuke", "Mai", "Koji", "Akiko", "Tomoya", "Haruka", "Masato", "Noriko"],
    last: ["Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi", "Kato", "Yoshida", "Yamada", "Sasaki", "Yamaguchi", "Matsumoto", "Inoue", "Kimura", "Hayashi", "Shimizu", "Yamazaki", "Mori", "Abe", "Ikeda", "Hashimoto", "Ishikawa", "Ogawa", "Okada", "Fujita", "Goto", "Hasegawa", "Murakami", "Kondo"],
  },
  hi: {
    first: ["Aarav", "Priya", "Vihaan", "Ananya", "Arjun", "Diya", "Rohan", "Kavya", "Rahul", "Sneha", "Vikram", "Pooja", "Amit", "Neha", "Suresh", "Lakshmi", "Rajesh", "Meera", "Karthik", "Divya", "Sanjay", "Anjali", "Imran", "Fatima", "Harpreet", "Gurpreet", "Arnav", "Ishita", "Manoj", "Sunita", "Deepak", "Revathi"],
    last: ["Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy", "Nair", "Iyer", "Rao", "Das", "Bose", "Chatterjee", "Mukherjee", "Joshi", "Mehta", "Shah", "Desai", "Kulkarni", "Pillai", "Menon", "Yadav", "Mishra", "Pandey", "Khan", "Ahmed", "Gill", "Sandhu", "Naidu", "Choudhury", "Banerjee", "Thakur"],
  },
  pt: {
    first: ["Ana", "João", "Maria", "Pedro", "Juliana", "Lucas", "Fernanda", "Gabriel", "Beatriz", "Rafael", "Camila", "Mateus", "Larissa", "Gustavo", "Mariana", "Felipe", "Aline", "Bruno", "Patrícia", "Rodrigo", "Letícia", "Thiago", "Renata", "Diego", "Vanessa", "Leonardo", "Tatiane", "Marcelo", "Débora", "Eduardo", "Luana", "Caio"],
    last: ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa", "Rocha", "Dias", "Nascimento", "Andrade", "Moreira", "Nunes", "Marques", "Machado", "Mendes", "Freitas", "Cardoso", "Teixeira"],
  },
};
