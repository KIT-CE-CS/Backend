const express = require("express")
const router = express.Router()
const Article = require("../schemas/article")
const Comment = require("../schemas/comment")
const User = require("../schemas/user")
const File = require("../schemas/file")
const multer = require("multer")
const upload = multer({ dest: "uploadFiles/" })
const fs = require("fs")
const { verifyUser, checkPermission } = require("./middlewares/authorization")

// Status Code
// 400 Bad Request
// 401 Unauthorized
// 403 Forbidden
// 404 Not Found
// 500 Internal Server Error

const isUserClassOne = async (id) => {
    const user = await User.findOne({ id: id })
    if (user.class === 1) return true
    return false
}

const addFiles = (articleId, files, list) => {
    files.forEach(async (file) => {
        let newFile = new File({
            articleId: articleId,
            size: file.size,
            originName: file.originalname,
            newName: file.filename,
        })
        list.push(newFile._id)
        await newFile.save()
    })
}

const deleteFiles = async (articleId) => {
    const files = await File.find({ articleId: articleId })
    files.forEach((file) => {
        fs.unlink("uploadfiles/"+file.newName, (e) => {
            if (e) console.log("error: ", e)
        })
    })
    await File.deleteMany({ articleId: articleId })
}

// 게시물 추가
router.post("/", verifyUser, upload.array("fileList"), async (req, res) => {
    if (req.body.tag === "notice" && await isUserClassOne(req.session.authorization)) {
        return res.status(401).send({ message: "No Permission" })
    }

    try {
        let newArticle = new Article({
            title: req.body.title,
            author: req.session.authorization,
            tag: req.body.tag,
            content: req.body.content,
            fileList: [],
            views: 0,
        })
        
        if (req.files) await addFiles(newArticle._id, req.files, newArticle.fileList)
        
        await newArticle.save()

        res.status(200).send({ message: "Success" })
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

const paging = (page, totalArticle, limit) => {
    page = parseInt(page)
    totalArticle = parseInt(totalArticle)
    limit = parseInt(limit)

    let pageNum = page || 1
    let postLimit = limit || 20
    const pagination = 10
    const hidePost = page === 1 ? 0 : (page - 1) * postLimit
    const totalPages = Math.ceil((totalArticle - 1) / postLimit)
    const startPage = Math.floor((pageNum - 1) / pagination) * pagination + 1
    let endPage = startPage + pagination - 1

    if (pageNum > totalPages) pageNum = totalPages
    if (endPage > totalPages) endPage = totalPages
    if (totalPages === 0) endPage = 1

    return { startPage, endPage, hidePost, postLimit, totalPages, pageNum }
}

// 전체 게시물 조회
router.get("/", async (req, res) => {
    const { page } = req.query
    const { limit } = req.query
    try {
        const totalArticle = await Article.countDocuments({})

        let { startPage, endPage, hidePost, postLimit, totalPages, pageNum } =
            paging(page, totalArticle, limit)

        const articles_ = await Article.find({})
            .sort({ createAt: -1 })
            .skip(hidePost)
            .limit(postLimit)

        const articles = await Promise.all(
            articles_.map(async (article) => {
                const authorName = await User.findOne({ id: article.author })
                const _name = authorName.name
                const name = { authorName: _name }
                const articleInfo = Object.assign(name, article._doc)
                return articleInfo
            })
        )
        res.json({
            articles, pageNum, startPage, endPage, postLimit, totalPages,
        }).status(200)
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

// 게시물 태그별 조회
router.get("/:tag", async (req, res) => {
    const { tag } = req.params
    const { page } = req.query
    const { limit } = req.query
    try {
        const totalArticle = await Article.countDocuments({ tag: tag, ...Article, })

        let { startPage, endPage, hidePost, postLimit, totalPages, pageNum } =
            paging(page, totalArticle, limit)

        const articles_ = await Article.find({ tag: tag, ...Article })
            .sort({ createAt: -1 })
            .skip(hidePost)
            .limit(postLimit)

        const articles = await Promise.all(
            articles_.map(async (article) => {
                const authorName = await User.findOne({ id: article.author, })
                const _name = authorName.name
                const name = { authorName: _name }
                const articleInfo = Object.assign(name, article._doc)
                return articleInfo
            })
        )
        res.json({ 
            articles, pageNum, startPage, endPage, postLimit, totalPages,
        }).status(200)
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

// 특정(_id) 게시물 조회
router.get("/view/:id", async (req, res) => {
    const _id = req.params.id

    try {
        const article = await Article.findOne({ _id, ...Article })
        const authorName = await User.findOne({ id: article.author })
        const name = { authorName: authorName.name }
        const articleInfo = Object.assign(name, article._doc)

        const next_ = await Article.find({
            date: { $gt: article.date },
        }).limit(1)

        const prev_ = await Article.find({
            date: { $lt: article.date },
        })
            .sort({ _id: -1 })
            .limit(1)

        const next = await Promise.all(
            next_.map(async (article) => {
                const authorName = await User.findOne({
                    id: article.author,
                })
                const _name = authorName.name
                const name = { authorName: _name }
                const articleInfo = Object.assign(name, article._doc)
                return articleInfo
            })
        )

        const prev = await Promise.all(
            prev_.map(async (article) => {
                const authorName = await User.findOne({
                    id: article.author,
                })
                const _name = authorName.name
                const name = { authorName: _name }
                const articleInfo = Object.assign(name, article._doc)
                return articleInfo
            })
        )

        await Article.findByIdAndUpdate(_id, {
            $set: { views: ++article.views },
        }).exec()

        res.json({ articleInfo, next, prev }).status(200)
    } catch (e) {
        console.log("error: ", e)
        res.status(404).send({ message: "No Post" })
    }
})

// 게시물 update (_id 기반)
router.patch("/:id", verifyUser, upload.array("fileList"), async (req, res) => {
    const _id = req.params.id

    // 수정 권한 조회
    if (!await checkPermission(req, res, _id, Article)) return

    const updateKeys = Object.keys(req.body)
    const allowedKeys = ["title", "content", "tag", "fileList"] // 변경 가능한 것
    const isValid = updateKeys.every((key) => allowedKeys.includes(key))
    if (!isValid) {
        return res.status(400).send({ message: "Cannot Update" })
    }

    const multipartType = 'multipart/form-data'

    // type == multipart    => 기존 파일 삭제
    if (multipartType == req.headers['content-type'].slice(0, multipartType.length)) {
        const newFileList = new Array()

        // Delete File
        await deleteFiles(_id)

        // file O          => 들어온 파일 모두 저장
        if (req.files.length != 0) await addFiles(_id, req.files, newFileList)

        req.body.fileList = newFileList
    }

    try {
        const editedArticle = await Article.findByIdAndUpdate(_id, req.body, {
            new: true,
        })
        if (!editedArticle) {
            return res.status(404).send({ message: "No Post" })
        }
        res.status(200).send({ message: "Success" })
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

// 게시물 삭제 (_id 기반)
router.delete("/:id", verifyUser, async (req, res) => {
    const _id = req.params.id

    //삭제 권한 조회
    if (!await checkPermission(req, res, _id, Article)) return

    try {
        //Delete Recomment
        Article.findById(_id, async (e, article) => {
            if (e) {
                console.log("error: ", e)
                return
            }
            article.commentList.forEach(async (curCmt, index) => {
                await Comment.deleteMany({ articleId: curCmt })
            })
        })

        //Delete Comment
        await Comment.deleteMany({ articleId: _id })

        //Delete File
        await deleteFiles(_id)

        //Delete Article
        const deletedArticle = await Article.findByIdAndDelete(_id)

        if (!deletedArticle) {
            return res.status(404).send({ message: "No Post" })
        }

        res.status(200).send({ message: "Success" })
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

module.exports = router
