const fs_ = require("fs")
const { promisify } = require("util")

const TF_FOLDER = "../tf_dataset"
const SETTINGS_FILE = "categorised.json"
const IMAGES_FOLDER = "images"
const EXCLUDE_CATEGORY = "exclude"
const PAGE_SIZE = 16
const settingsPath = `${IMAGES_FOLDER}/${SETTINGS_FILE}`

const fs = {
  readdir: promisify(fs_.readdir),
  readFile: promisify(fs_.readFile),
  writeFile: promisify(fs_.writeFile),
  mkdir: promisify(fs_.mkdir),
  rmdir: promisify(fs_.rmdir),
  copyFile: promisify(fs_.copyFile),
}

function getCategoryButton(file, categorised, category) {
  const categoryFiles = categorised[category] ?? []
  const activeClass = categoryFiles.includes(file) ? "active-category" : ""
  return `
    <button 
      class="category-button ${activeClass} category-${category}"
      data-category="${category}"
      data-file="${file}"
    >
      ${category}
    </button>
  `
}

function getCategoriesButtons(file, categorised, categories) {
  return `
  <div class="categories">
    ${categories
      .map((category) => getCategoryButton(file, categorised, category))
      .join("")}
      <button
        class="zoom-button"
        data-file="${file}"
      >
        Zoom
    </button>
  </div>
  `
}

function getImagePath(file) {
  return `file://${__dirname}/images/${file}`
}

function getImage(file, categorised, categories) {
  return `
    <div class="image">
      <img src="${getImagePath(file)}" title="${file}">
      ${getCategoriesButtons(file, categorised, categories)}
    </div>
`
}

async function getImages(categorised, categories, images, page) {
  const imagesRes = images
    .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    .map((file) => getImage(file, categorised, categories))

  return imagesRes.join("")
}

function toggleFileCategory(e, categorised) {
  const category = e.target.attributes["data-category"].value
  const file = e.target.attributes["data-file"].value
  categorised[category] = categorised[category] ?? []
  if (categorised[category].includes(file)) {
    categorised[category] = categorised[category].filter((x) => x !== file)
  } else {
    categorised[category].push(file)
  }
}

function showZoomedImage(e) {
  const img = document.getElementById("zoomed-image")
  img.classList.remove("hidden")
  img.src = getImagePath(e.target.attributes["data-file"].value)
  img.title = e.target.attributes["data-file"].value
}

function hideZoomedImage(params) {
  document.getElementById("zoomed-image").classList.add("hidden")
}

async function render({ categorised, categories, page }, images, pagesCount) {
  const imagesGrid = document.getElementById("images-grid")
  imagesGrid.innerHTML = await getImages(categorised, categories, images, page)
  const toggleCategory = (e) => {
    toggleFileCategory(e, categorised)
    render({ categorised, categories, page }, images, pagesCount)
  }
  const categoryButtons = document.getElementsByClassName("category-button")
  ;[...categoryButtons].forEach((btn) => btn.addEventListener("click", toggleCategory))
  const zoomButtons = document.getElementsByClassName("zoom-button")
  ;[...zoomButtons].forEach((btn) => btn.addEventListener("click", showZoomedImage))

  document.getElementById("page-label").innerHTML = `page ${page + 1}/${pagesCount}`
}

async function onContentLoaded() {
  const files = await fs.readdir(IMAGES_FOLDER)
  let state = { categorised: {}, categories: ["ass"], page: 0 }
  const settingsPath = `${IMAGES_FOLDER}/${SETTINGS_FILE}`
  if (files.includes(SETTINGS_FILE)) {
    state = JSON.parse(await fs.readFile(settingsPath))
  }
  const images = files.filter((x) => x.includes(".jpeg") || x.includes(".jpg"))
  const pagesCount = Math.ceil(images.length / PAGE_SIZE)
  await render(state, images, pagesCount)

  const savingLabel = document.getElementById("saving-label")
  const save = async () => {
    savingLabel.classList.remove("hidden")
    await fs.writeFile(settingsPath, JSON.stringify(state, null, 4))
    savingLabel.classList.add("hidden")
  }

  const prev = () => {
    if (state.page > 0) {
      state.page--
      render(state, images, pagesCount)
    }
  }
  const next = () => {
    if (state.page < pagesCount - 1) {
      state.page++
      save()
      render(state, images, pagesCount)
    }
  }

  const setProgress = (progress) => {
    document.getElementById("progress-label").innerHTML = progress
  }

  const exportForTensorFlow = async (state) => {
    const files = await fs.readdir(IMAGES_FOLDER)
    if (!files.includes(SETTINGS_FILE)) return
    const { categorised = {} } = JSON.parse(await fs.readFile(settingsPath))
    const categories = Object.keys(categorised).filter
    const categorisedImages = Object.values(categorised).flat()
    const notCategorized = images.filter((f) => !categorisedImages.includes(f))
    const excludeCount = categorised[EXCLUDE_CATEGORY]?.length ?? 0
    const categorizedCount = categorisedImages.length - excludeCount
    const totalFiles = 2 * Math.min(categorizedCount, notCategorized.length)
    let filesCopied = 0
    const copyFile = async (file, dest) => {
      await fs.copyFile(`${IMAGES_FOLDER}/${file}`, `${dest}/${file}`)
      setProgress(`${filesCopied++}/${totalFiles} copied`)
    }
    await fs.rmdir(TF_FOLDER, { recursive: true })
    await fs.mkdir(TF_FOLDER)
    const notCategorizedFolder = `${TF_FOLDER}/notCategorized`
    await fs.mkdir(notCategorizedFolder)
    const notCategorizedToCopy = notCategorized.slice(0, categorizedCount)
    for (const file of notCategorizedToCopy) {
      await copyFile(file, notCategorizedFolder)
    }
    const categorizedToCopy = Object.entries(categorised).filter(
      ([category, files]) => category !== EXCLUDE_CATEGORY
    )
    for (const [category, files] of categorizedToCopy) {
      const categoryFolder = `${TF_FOLDER}/${category}`
      await fs.mkdir(categoryFolder)
      for (const file of files) {
        await copyFile(file, categoryFolder)
      }
    }
    setProgress("")
  }

  document.addEventListener("keydown", (e) => {
    if (e.code === "ArrowRight" || e.key === "s") {
      next()
    }
    if (e.code === "ArrowLeft" || e.key === "a") {
      prev()
    }
  })

  document.getElementById("save").addEventListener("click", save)
  document.getElementById("prev").addEventListener("click", prev)
  document.getElementById("next").addEventListener("click", next)
  document.getElementById("zoomed-image").addEventListener("click", hideZoomedImage)
  document
    .getElementById("exportForTensorFlow")
    .addEventListener("click", exportForTensorFlow)
}

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
window.addEventListener("DOMContentLoaded", onContentLoaded)
