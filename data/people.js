/*
 * Z Lab people.
 *
 * To add someone, add { name, photo, cv } to the right group:
 *   name   as it should appear
 *   photo  file name inside assets/img/people/ (optional; initials are shown without one).
 *          Any reasonably sized image works; around 600 px on the short side is plenty.
 *   pos    CSS object-position used to frame the face in the square crop (optional),
 *          e.g. "50% 15%" moves the crop window toward the top of the photo.
 *   cv     file name of the CV inside cvBase (optional)
 *
 * When someone leaves, move them to `alumni` (or `atombotAlumni`).
 */
window.ZLAB_PEOPLE = {
  photoBase: "assets/img/people/",
  cvBase: "https://z.engin.umich.edu/cv/",

  groups: [
    {
      id: "postdocs",
      title: "Postdocs and Research Fellows",
      size: "lg",
      members: [
        { name: "Eric Flynn", photo: "eric-flynn.webp", cv: "CV_Eric_Flynn.pdf" },
        { name: "Natei Ermias", photo: "natei-ermias.webp" },
      ],
    },
    {
      id: "phd",
      title: "PhD Students",
      size: "lg",
      members: [
        { name: "Lucas Trojanowski", photo: "lucas-trojanowski.webp", cv: "CV_Lucas_Trojanowski.pdf" },
        { name: "Naomi Raicu", photo: "naomi-raicu.webp", cv: "CV_Naomi_Raicu.pdf" },
        { name: "David Ho", photo: "david-ho.webp" },
        { name: "Celing Li", photo: "celing-li.webp" },
        { name: "Emma Nei", photo: "emma-nei.webp" },
      ],
    },
    {
      id: "ms",
      title: "MS Students",
      size: "sm",
      members: [
        { name: "Alex Blickhan", photo: "alex-blickhan.webp" },
        { name: "Pranav Jain", photo: "pranav-jain.webp" },
        { name: "Zehan Qin", photo: "zehan-qin.webp" },
      ],
    },
    {
      id: "undergrad",
      title: "Undergraduate Students",
      size: "sm",
      members: [
        { name: "Majid Al Buraiky", photo: "majid-al-buraiky.webp" },
        { name: "Keegan Balcerzak", photo: "keegan-balcerzak.webp" },
        { name: "Luis Carvallo", photo: "luis-carvallo.webp" },
        { name: "Daniel Chen", photo: "daniel-chen.webp" },
        { name: "Eric Fisco", photo: "eric-fisco.webp" },
        { name: "Howard Huang", photo: "howard-huang.webp" },
        { name: "James Kaleta", photo: "james-kaleta.webp" },
        { name: "Mason Knaup", photo: "mason-knaup.webp" },
        { name: "Kaiyu Isabella Liu", photo: "kaiyu-isabella-liu.webp" },
        { name: "Lourd Louis", photo: "lourd-louis.webp" },
        { name: "Malia Moreno", photo: "malia-moreno.webp" },
        { name: "Enzo Morucci", photo: "enzo-morucci.webp" },
        { name: "Yun Jong (Kevin) Na", photo: "yun-jong-kevin-na.webp" },
        { name: "Carlota Navarro", photo: "carlota-navarro.webp" },
        { name: "Trevor Nelson", photo: "trevor-nelson.webp" },
        { name: "Mason Niu", photo: "mason-niu.webp" },
        { name: "Erik Rollmann", photo: "erik-rollmann.webp", pos: "64% 22%" },
        { name: "Brian Totonchi", photo: "brian-totonchi.webp" },
        { name: "Madelyn Tran", photo: "madelyn-tran.webp" },
        { name: "John Verga", photo: "john-verga.webp" },
        { name: "Helen Wang", photo: "helen-wang.webp" },
        { name: "Isaac Wheeler", photo: "isaac-wheeler.webp" },
        { name: "Connor Woods", photo: "connor-woods.webp" },
        { name: "Derek Wurzer", photo: "derek-wurzer.webp" },
        { name: "Yule (Peter) Xie", photo: "yule-peter-xie.webp" },
        { name: "Jathan Yao", photo: "jathan-yao.webp" },
      ],
    },
  ],

  /* Newest first. `now` is where they went next (optional). */
  alumni: [
    { name: "Ruben Fonseca Castro", degree: "MS in Robotics", school: "UMich", year: 2026, now: "Tesla Optimus Robot" },
    { name: "Luca Murg", degree: "PhD in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2026, now: "Argonne National Laboratory" },
    { name: "Sujit Lakshmikanth", degree: "MS in Electrical and Computer Engineering", school: "UMich", year: 2025, now: "AM General LLC" },
    { name: "Vitor Grizzi", degree: "PhD in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2024, now: "Argonne National Laboratory" },
    { name: "Shao-Chun Lee", degree: "PhD in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2024, now: "AMD" },
    { name: "David Null", degree: "PhD in Electrical and Computer Engineering", school: "UIUC", year: 2024, now: "Founder and CEO" },
    { name: "Kevin Wandke", degree: "PhD in Electrical and Computer Engineering", school: "UIUC", year: 2024, now: "UIUC" },
    { name: "Kelsey Luo", degree: "MS in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2024, now: "KPMG" },
    { name: "Yanqin Zhai", degree: "PhD in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2022, now: "Nvidia" },
    { name: "Long Zhou", degree: "PhD in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2022, now: "Tesla" },
    { name: "Zhixia Li", degree: "PhD in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2022, now: "Nvidia" },
    { name: "Peng Luo", degree: "Postdoc", school: "UIUC", year: 2021, now: "UPenn" },
    { name: "Hossam Farag", degree: "MS in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2020 },
    { name: "Zhongyi Shen", degree: "MS in Electrical and Computer Engineering", school: "UIUC", year: 2020, now: "Nvidia" },
    { name: "Nathan P. Walter", degree: "PhD in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2019, now: "Intel" },
    { name: "Zhikun Cai", degree: "PhD in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2019, now: "Cadence" },
    { name: "Thamires A. Lima", degree: "Postdoc", school: "UIUC", year: 2018, now: "Drexel University" },
    { name: "Wade Fuerste", degree: "MS in Chemistry", school: "UIUC", year: 2017 },
    { name: "Abhishek Jaiswal", degree: "PhD in Nuclear, Plasma, and Radiological Engineering", school: "UIUC", year: 2016, now: "Intel" },
    { name: "Ke Yang", degree: "PhD in Materials Science and Engineering", school: "UIUC", year: 2016, now: "Apple" },
  ],

  atombotAlumni: [
    "Timothy Awad", "Haesue Baik", "Sri Balaji", "Sofia Barrientos", "Andre Beltran", "Neil Beri",
    "Marco Boone", "Aron Choo", "Calvin Condon", "Ava Cysner", "Briggs Daman", "Yanira De Souza",
    "Daniela Serrano Diaz", "Yinan Dong", "Joao Pedro Gentil Figueiredo", "Ruben Fonseca", "Jiarui Gu",
    "Liv Heald", "Qingyu Hu", "David Huang", "James Jackworth", "Cameron Jones", "Ryan Kaelle",
    "Eamon Kennedy", "Jonah Kelman", "Sean Ko", "Beck Krebs", "Ethan Ku", "Saavi Kumar",
    "Sujit Lakshmikanth", "Connor Madriago", "Matthew Magro", "Tucker Patterson", "Elena Pawloski",
    "Alexander Rebits", "Luis Sanchez", "Issac Song", "Justin Song", "Hadi Soweidan", "Felix Tang",
    "Alan Wen", "Erin Xu", "Mo Yang", "Alan Yu", "Shilin (Kevin) Yuan", "William Zhang",
  ],
};
