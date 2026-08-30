export let items = [
  {
    timestamp: '',
    title: 'Что-то на русском',
    company: 'Flexy'
  },
  {
    timestamp: '',
    title: 'Сервис подбора подарков',
    company: 'GiftBox'
  },
  {
    timestamp: '',
    title: 'Сервис',
    company: 'Service'
  },
]

/**
 * A
 * B
 * 
 * -> {x,y,z} [...], {x,y,z} [...], {x,y,z} [...], {x,y,z} [...]
 * 
 * A -> B
 * B -> A
 * 
 * A -> B <=> B -> A
 * 
 * n! 3! = 6
 * 
 * 22! = ...
 */

let Company = /** @type {const} */ ({
  Flexy: 'Flexy',
  Giftbox: 'Giftbox',
  Huntio: 'Huntio',
  Cleverbot: 'Cleverbot',
  // ...
})

let Project = {
  ZavodArchive: 'ZavodArchive',
  Giftbox: 'Giftbox',
  AstPlatform: 'AstPlatform',
  AiMarketplace: 'AiMarketplace',
  // ...
}

let CompanyProjects = {
  [Company.Flexy]: [Project.ZavodArchive],
  // ...
}

let CompanyPoint = {
  [Company.Flexy]: { x: -29.62, y: 2.81, z: -24.85 },
  [Company.Giftbox]: { x: -34.73, y: 2.8, z: -8.55 }
}


let CompanyTransitionOptions = {
  [Company.Flexy]: {
    // ... тут надо понять какая вообще нужна конфигурация при переходе из точки в точку в трёх-мерном пространстве
  }
}

/**
 * @param {keyof typeof Company} company 
 */
let flyTo = company => camera.flyTo(CompanyPoint[company], CompanyTransitionOptions[company])

// UI List => Call method on click: flyTo(Company.Giftbox)