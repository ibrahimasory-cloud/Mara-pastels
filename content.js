const maraPastel = {
  whatsappSource: "Source : site Mara Pastel",
  products: [
    { id: "mini", photo: "product.poulet", name: "Mini pastels", description: "De petits pastels faits maison, au poulet, à la viande ou au thon." },
    { id: "king", photo: "product.thon", name: "Pastel King", description: "Un grand pastel fait maison, proposé à l’unité." },
    { id: "sauce", photo: "product.viande", name: "La sauce magique", description: "Notre sauce maison, en accompagnement de vos pastels." }
  ],
  orderItems: [
    { id: "chicken", name: "Mini pastels au poulet", product: "mini" },
    { id: "meat", name: "Mini pastels à la viande", product: "mini" },
    { id: "tuna", name: "Mini pastels au thon", product: "mini" },
    { id: "king", name: "Pastel King", product: "king" },
    { id: "sauce", name: "La sauce magique", product: "sauce" }
  ],
  settings: {
    miniPrice: 5000,
    miniMinimum: 6,
    kingPrice: 40000,
    saucePrice: null,
    miniAvailable: true,
    kingAvailable: true,
    sauceAvailable: true,
    whatsappNumber: "224626209791",
    orderHours: "Du lundi au vendredi",
    deliveryHours: "sur rendez-vous",
    deliveryArea: "Kipé, Conakry",
    payment: "",
    facebook: "",
    tiktok: ""
  },
  events: []
};
