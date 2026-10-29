/**
 * Name pools for the people Planetarch makes up: leaders, ministers, heirs, governors, party
 * chiefs. Everyone in the game is fictional; names follow the country's languages.
 */

export type Culture =
  | "en" | "de" | "fr" | "es" | "pt" | "it" | "nl" | "nordic" | "pl" | "cz" | "ru" | "ua" | "balkan" | "gr" | "tr" | "ar" | "fa" | "he"
  | "hi" | "bn" | "zh" | "ja" | "ko" | "vi" | "th" | "ms" | "fil" | "sw" | "yo" | "ha" | "am" | "zu" | "hu" | "ro" | "fi" | "ka";

const P = (m: string, f: string, l: string) => ({ m: m.split(" "), f: f.split(" "), l: l.split(" ") });

export const NAMES: Record<Culture, { m: string[]; f: string[]; l: string[] }> = {
  en: P("James Oliver Thomas Daniel Michael Andrew Robert Henry Samuel Patrick Owen Marcus", "Emma Charlotte Grace Sarah Rachel Helen Laura Claire Megan Alice Fiona Diane", "Whitmore Ashford Calloway Pemberton Hartley Lockwood Fairbanks Kendrick Holloway Thornton Mercer Delaney Bramwell Garrison Ellery"),
  de: P("Lukas Jonas Matthias Stefan Felix Tobias Markus Florian Johannes Konrad", "Anna Katrin Sabine Julia Lena Miriam Annegret Ulrike Franziska Helga", "Brandauer Hollweg Steinmetz Albrecht Kellermann Wendel Lindqvist Hartung Vogelsang Reinhold Esser Baumgart"),
  fr: P("Julien Mathieu Antoine Laurent Olivier Philippe Bastien Rémi Gaspard Étienne", "Claire Juliette Sophie Camille Élise Hélène Margaux Isabelle Agathe Nathalie", "Delacroix Morvan Lefébure Castaing Rouvier Marchetti Duquesne Villeneuve Beaumanoir Chastel Fontaine Arnaud"),
  es: P("Alejandro Javier Mateo Diego Carlos Rafael Andrés Tomás Joaquín Emilio", "Lucía Carmen Elena Isabel Marta Pilar Valeria Inés Rocío Teresa", "Valcárcel Montoya Irigoyen Cifuentes Arriaga Salcedo Echeverría Benavides Quiroga Olmedo Peralta Zamora"),
  pt: P("João Rafael Tiago Gustavo Bruno Rodrigo Henrique Vinícius Sérgio Paulo", "Ana Beatriz Mariana Luísa Fernanda Joana Carolina Raquel Helena Cecília", "Albuquerque Siqueira Bettencourt Magalhães Coutinho Valadares Moraes Teixeira Brandão Leitão Furtado Queiroz"),
  it: P("Marco Lorenzo Giovanni Matteo Andrea Riccardo Stefano Paolo Davide Enrico", "Giulia Francesca Chiara Elena Silvia Valentina Alessandra Paola Martina Beatrice", "Ferraresi Castellani Mancuso Bellandi Gregori Pavesi Santoro Lombardini Colonna Fabbri Rinaldi Vescovi"),
  nl: P("Daan Joost Pieter Maarten Bram Sander Wouter Thijs", "Eva Sanne Femke Lotte Marloes Ingrid Anouk Mirjam", "van Houten de Graaf Brouwer Verbeek van Dijk Kuipers Hendriks Vos Smit de Ruiter"),
  nordic: P("Erik Magnus Lars Anders Henrik Nils Olav Sven Bjørn Mikkel", "Ingrid Astrid Sofie Karin Liv Maja Sigrid Hanna Freja Elin", "Lindgren Haugland Østby Brekke Sandvik Holmberg Dahl Ekström Berglund Thorsen Nygaard Eklund"),
  pl: P("Piotr Tomasz Krzysztof Paweł Michał Marcin Jakub Wojciech Andrzej", "Anna Katarzyna Magdalena Agnieszka Joanna Ewa Zofia Małgorzata", "Wiśniewski Zieliński Kowalczyk Lewandowicz Dąbrowski Nowicki Jabłoński Sikorski Wróblewski"),
  cz: P("Jan Tomáš Petr Jiří Ondřej Martin Lukáš Vojtěch", "Tereza Eliška Lucie Kateřina Markéta Veronika Hana Jana", "Novotný Dvořák Procházka Kučera Veselý Horák Němec Pokorný Marek"),
  ru: P("Aleksandr Dmitri Sergei Andrei Mikhail Nikolai Pavel Viktor Yuri Oleg", "Olga Natalia Irina Yelena Tatiana Svetlana Anastasia Marina Galina", "Volkov Sorokin Belyaev Gromov Zhuravlev Krylov Lebedev Morozov Tarasov Orlov Kuznetsov Shirokov"),
  ua: P("Oleksandr Andriy Taras Bohdan Mykola Yaroslav Dmytro Serhiy Vasyl", "Oksana Iryna Olena Kateryna Halyna Yulia Solomiya Nataliya", "Kovalenko Bondarenko Shevchuk Tkachenko Melnyk Kravchuk Hrytsenko Lysenko Moroz Savchenko"),
  balkan: P("Marko Nikola Stefan Luka Dragan Milan Goran Aleksandar Ivan", "Ana Jelena Milica Ivana Maja Snežana Vesna Marija", "Petrović Kovačević Marković Jovanović Babić Horvat Novak Popović Ilić Stojanović"),
  gr: P("Giorgos Dimitris Nikos Kostas Yannis Christos Alexandros Panagiotis", "Maria Eleni Katerina Sofia Despina Ioanna Anna Georgia", "Papadakis Karamanlis Antonopoulos Vlachos Georgiou Makris Stavridis Kontos Lambrou"),
  tr: P("Mehmet Mustafa Ahmet Emre Burak Murat Kerem Selim Can Oğuz", "Ayşe Fatma Zeynep Elif Esra Selin Defne Merve Hülya", "Yıldırım Aydın Kaya Şahin Demirtaş Çelik Arslan Özkan Kılıç Aksoy Erdem Karaca"),
  ar: P("Ahmed Khalid Omar Youssef Hassan Tariq Faisal Karim Samir Nabil Walid Rashid", "Fatima Layla Nour Mariam Amira Huda Rania Salma Yasmin Dalia", "al-Haddad Mansour Khoury Nasser al-Qasimi Haddad Saleh Barakat al-Amin Darwish Habib Azzam"),
  fa: P("Reza Ali Hossein Mehdi Dariush Kamran Arash Babak Farhad", "Maryam Shirin Parisa Leila Nasrin Roya Azadeh Golnar", "Tehrani Karimi Ahmadi Moradi Sadeghi Rostami Farahani Jafari Hashemi Amini"),
  he: P("David Yosef Avi Eitan Noam Amir Ron Yonatan", "Noa Tamar Michal Yael Shira Ronit Dana Maya", "Levin Ben-Ami Peretz Shalev Golan Carmel Mizrahi Dror Barak"),
  hi: P("Arjun Rahul Vikram Rohan Aditya Sanjay Amit Rajesh Anil Kiran Suresh", "Priya Ananya Kavita Sunita Meera Lakshmi Deepa Neha Pooja Asha", "Sharma Verma Iyer Nair Reddy Kapoor Mehta Bhatt Chatterjee Malhotra Deshpande Rao"),
  bn: P("Rahim Karim Tanvir Imran Arif Shafiq Mahbub Nasir", "Ayesha Nusrat Farhana Shirin Tahmina Rumana Sabina", "Chowdhury Rahman Hossain Islam Talukdar Sarkar Mia Uddin"),
  zh: P("Wei Jun Hao Lei Ming Jian Tao Bo Yong Qiang Zhiwei", "Li Na Mei Xia Yan Jing Hui Ying Lan Fang", "Zhao Qian Sun Zhou Wu Zheng Feng Chen Wei Jiang Shen Han Yang Lu"),
  ja: P("Hiroshi Takeshi Kenji Daisuke Satoshi Haruto Yuto Kazuo Makoto Shun", "Yuki Aiko Haruka Sakura Mei Emi Naomi Keiko Rina", "Takahashi Watanabe Nakamura Kobayashi Yoshida Matsumoto Inoue Kimura Hayashi Shimizu Mori Ishikawa"),
  ko: P("Min-jun Seo-jun Ji-ho Hyun-woo Dong-hyun Jae-won Sung-min Tae-yang", "Ji-woo Seo-yeon Min-seo Ha-eun Su-bin Ye-jin Yu-na", "Kim Lee Park Choi Jung Kang Cho Yoon Jang Lim Han Shin"),
  vi: P("Minh Tuấn Hùng Quang Dũng Thành Long Khoa", "Lan Hương Mai Linh Thảo Ngọc Trang Hà", "Nguyễn Trần Lê Phạm Hoàng Phan Vũ Đặng Bùi Đỗ"),
  th: P("Somchai Anan Prasert Kittipong Narong Surachai Thanawat", "Siriporn Ploy Nattaya Kanokwan Malee Suda", "Srisuk Wongsakul Chaiyaporn Rattanakul Boonmee Thongchai Sukhumvit"),
  ms: P("Ahmad Budi Rizal Hafiz Agus Hendra Irfan Fikri", "Siti Dewi Nurul Ayu Putri Rina Aisyah", "Santoso Wijaya Hidayat Rahman Ismail Kusuma Pratama Halim Saputra"),
  fil: P("Jose Miguel Antonio Ramon Paolo Rafael Carlo", "Maria Liza Grace Kristine Joy Andrea Bea", "Santos Reyes Cruz Bautista Villanueva Mendoza Aquino Dimaculangan Navarro"),
  sw: P("Baraka Juma Daudi Kamau Otieno Mwangi Hamisi Joseph", "Amani Neema Wanjiru Zawadi Achieng Imani Faraja", "Mwangi Odhiambo Njoroge Kiprono Wekesa Mutua Kariuki Onyango Mbeki Nyerere"),
  yo: P("Adebayo Chinedu Emeka Oluwaseun Kwame Kofi Tunde Ikenna Femi", "Ngozi Adaeze Folake Ama Yetunde Chioma Efua Abena", "Okonkwo Adeyemi Mensah Nwosu Boateng Okafor Asante Balogun Owusu Eze"),
  ha: P("Abdoulaye Moussa Ibrahim Amadou Souleymane Ousmane Idrissa Mamadou", "Aminata Fatoumata Mariam Awa Hawa Kadiatou", "Traoré Diallo Keïta Coulibaly Sow Touré Diop Ndiaye Sanogo Camara"),
  am: P("Abebe Dawit Tesfaye Yonas Girma Haile Bereket", "Hirut Selam Meseret Tigist Almaz Saba", "Bekele Tadesse Gebre Alemu Mengistu Wolde Kebede"),
  zu: P("Sipho Thabo Mandla Bongani Themba Lwazi Kagiso", "Nomvula Thandiwe Lindiwe Naledi Zanele Palesa", "Dlamini Nkosi Mthembu Khumalo Ndlovu Molefe Mahlangu Zulu"),
  hu: P("Bence Gergely Zoltán Ádám Levente Tamás Péter", "Eszter Réka Zsófia Katalin Ildikó Anna", "Horváth Szabó Tóth Varga Kiss Molnár Farkas Balogh"),
  ro: P("Andrei Mihai Radu Bogdan Cristian Vlad Ionuț", "Ioana Andreea Elena Raluca Simona Irina", "Popescu Ionescu Dumitrescu Stan Constantin Marinescu Vasilescu"),
  fi: P("Mikko Juha Antti Ville Jari Petteri Lauri", "Aino Riikka Sanna Laura Minna Kaisa", "Virtanen Korhonen Mäkinen Nieminen Heikkinen Laine Lehtonen Salonen"),
  ka: P("Giorgi Levan Davit Irakli Nika Zurab", "Nino Tamar Mariam Ana Ketevan", "Beridze Kapanadze Gelashvili Lomidze Tsiklauri Abashidze"),
};

/** The culture of a country (by ISO code); a sensible default by region otherwise. */
const CULTURE: Record<string, Culture> = {
  USA: "en", GBR: "en", CAN: "en", AUS: "en", NZL: "en", IRL: "en", JAM: "en", TTO: "en", BHS: "en", BRB: "en", BLZ: "en", GUY: "en", FJI: "en", PNG: "en", SLB: "en", VUT: "en", WSM: "en", LBR: "en", SLE: "en", GMB: "en", MLT: "en", CYP: "gr",
  DEU: "de", AUT: "de", CHE: "de", LUX: "fr", LIE: "de",
  FRA: "fr", BEL: "fr", MCO: "fr", HTI: "fr", SEN: "ha", CIV: "fr", CMR: "fr", GAB: "fr", COG: "fr", COD: "fr", MDG: "fr", TGO: "fr", BEN: "fr", CAF: "fr", TCD: "ha", BDI: "fr", RWA: "sw", DJI: "ar", COM: "ar",
  ESP: "es", MEX: "es", ARG: "es", COL: "es", PER: "es", VEN: "es", CHL: "es", ECU: "es", GTM: "es", CUB: "es", BOL: "es", DOM: "es", HND: "es", PRY: "es", SLV: "es", NIC: "es", CRI: "es", PAN: "es", URY: "es", GNQ: "es",
  PRT: "pt", BRA: "pt", AGO: "pt", MOZ: "pt", GNB: "pt", CPV: "pt", STP: "pt", TLS: "pt",
  ITA: "it", SMR: "it", NLD: "nl", SUR: "nl",
  SWE: "nordic", NOR: "nordic", DNK: "nordic", ISL: "nordic", FIN: "fi", EST: "fi",
  POL: "pl", CZE: "cz", SVK: "cz", LTU: "pl", LVA: "pl",
  RUS: "ru", BLR: "ru", KAZ: "ru", KGZ: "ru", UKR: "ua", MDA: "ro", ROU: "ro", HUN: "hu", GEO: "ka", ARM: "ka",
  SRB: "balkan", HRV: "balkan", BIH: "balkan", SVN: "balkan", MNE: "balkan", MKD: "balkan", BGR: "balkan", ALB: "balkan", KOS: "balkan",
  GRC: "gr", TUR: "tr", AZE: "tr", TKM: "tr", UZB: "tr", TJK: "fa", AFG: "fa", IRN: "fa", ISR: "he",
  SAU: "ar", ARE: "ar", QAT: "ar", KWT: "ar", OMN: "ar", BHR: "ar", YEM: "ar", IRQ: "ar", SYR: "ar", JOR: "ar", LBN: "ar", EGY: "ar", LBY: "ar", TUN: "ar", DZA: "ar", MAR: "ar", ESH: "ar", MRT: "ar", SDN: "ar", SOM: "ar", SOL: "ar", PSE: "ar",
  IND: "hi", PAK: "hi", NPL: "hi", LKA: "hi", BTN: "hi", MDV: "hi", BGD: "bn",
  CHN: "zh", TWN: "zh", SGP: "zh", MNG: "zh", HKG: "zh", CYN: "zh",
  JPN: "ja", KOR: "ko", PRK: "ko", VNM: "vi", THA: "th", LAO: "th", KHM: "th", MMR: "th",
  IDN: "ms", MYS: "ms", BRN: "ms", PHL: "fil",
  KEN: "sw", TZA: "sw", UGA: "sw", MWI: "sw", ZMB: "sw", SSD: "sw",
  NGA: "yo", GHA: "yo", MLI: "ha", NER: "ha", BFA: "ha", GIN: "ha",
  ETH: "am", ERI: "am",
  ZAF: "zu", ZWE: "zu", BWA: "zu", NAM: "zu", LSO: "zu", SWZ: "zu", MUS: "en",
};
const BY_CONTINENT: Record<string, Culture> = { Europe: "en", Asia: "zh", Africa: "yo", "North America": "es", "South America": "es", Oceania: "en" };

export function cultureOf(iso: string, continent: string): Culture {
  return CULTURE[iso] ?? BY_CONTINENT[continent] ?? "en";
}

/** A name from a culture, picked by a random number source. */
export function personName(c: Culture, female: boolean, r: () => number): string {
  const n = NAMES[c];
  const first = female ? n.f : n.m;
  return `${first[Math.floor(r() * first.length)]} ${n.l[Math.floor(r() * n.l.length)]}`;
}
