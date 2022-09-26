const express = require("express")
const router = express.Router()
const Article = require("../schemas/article")
const Comment = require("../schemas/comment")
const User = require("../schemas/user")
const File = require("../schemas/file")
const Report = require("../schemas/report")
const multer = require("multer")
const upload = multer({ dest: "uploadFiles/" })
const fs = require("fs")
const { verifyUser, checkPermission } = require("./middlewares/authorization")
const paging = require("./js/pagination")

const isUserClassOne = async (id) => {
    const user = await User.findOne({ id: id })
    return user.class === 1
}

const addFiles = (articleId, files, list) => {
    files.forEach(async (file) => {
        let newFile = new File({
            articleId: articleId,
            size: file.size,
            originName: Buffer.from(file.originalname, "latin1").toString(
                "utf8"
            ),
            newName: file.filename,
        })
        list.push(newFile._id)
        await newFile.save()
    })
}

const deleteFiles = async (articleId) => {
    const files = await File.find({ articleId: articleId })
    files.forEach((file) => {
        fs.unlink("uploadfiles/" + file.newName, (e) => {
            if (e) console.log("error: ", e)
        })
    })
    await File.deleteMany({ articleId: articleId })
}

// 게시물 추가
router.post("/", verifyUser, upload.array("fileList"), async (req, res) => {
    req.body = JSON.parse(req.body.data)

    if (
        req.body.tag === "notice" &&
        (await isUserClassOne(req.session.authorization))
    ) {
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

        if (req.files)
            await addFiles(newArticle._id, req.files, newArticle.fileList)

        await newArticle.save((e) => {
            if (e) console.log("error: ", e)
        })
        res.status(200).send({ message: "Success" })
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

const validateAndSetOption = (title, content) => {
    if (title && content)
        // 검색어는 둘 중 하나만 허용
        return null

    let searchOption = {}

    if (title) {
        searchOption.title = { $regex: title, $options: "i" }
    } else if (content) {
        searchOption.content = { $regex: content, $options: "i" }
    } // 검색어가 없는 경우 전체

    return searchOption
}

const getArticlesWithAuthorName = async (hide, limit, option) => {
    const articles_ = await Article.find(option)
        .sort({ date: -1 })
        .skip(hide)
        .limit(limit)

    return await Promise.all(
        articles_.map(async (article) => {
            const author = await User.findOne({ id: article.author })

            let count = await Comment.countDocuments({ articleId: article._id })
            for (const comment of article.commentList) {
                count += await Comment.countDocuments({ articleId: comment._id })
            }

            const info = {
                authorName: author ? author.name : "(알 수 없음)",
                commentCount: count,
            }
            const articleInfo = Object.assign(info, article._doc)
            return articleInfo
        })
    )
}

// 게시물 조회
// title 또는 content가 있으면 검색 기능
router.get("/", async (req, res) => {
    const { title, content, page, limit } = req.query

    const searchOption = validateAndSetOption(title, content)
    if (!searchOption) return res.status(404).end()

    try {
        const totalArticle = await Article.countDocuments(searchOption)

        let { startPage, endPage, hidePost, postLimit, totalPages, pageNum } =
            paging(page, totalArticle, limit)

        const articles = await getArticlesWithAuthorName(
            hidePost,
            postLimit,
            searchOption
        )

        res.json({
            articles,
            pageNum,
            startPage,
            endPage,
            postLimit,
            totalPages,
            totalArticle,
        }).status(200)
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

// 게시물 태그별 조회
// title 또는 content가 있으면 검색 기능
router.get("/:tag", async (req, res) => {
    const { tag } = req.params
    const { title, content, page, limit } = req.query

    let searchOption = validateAndSetOption(title, content)
    if (!searchOption) return res.status(404).end()

    searchOption.tag = tag

    try {
        const totalArticle = await Article.countDocuments(searchOption)

        let { startPage, endPage, hidePost, postLimit, totalPages, pageNum } =
            paging(page, totalArticle, limit)

        const articles = await getArticlesWithAuthorName(
            hidePost,
            postLimit,
            searchOption
        )

        res.json({
            articles,
            pageNum,
            startPage,
            endPage,
            postLimit,
            totalPages,
            totalArticle,
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
        const author = await User.findOne({ id: article.author })
        const name = {
            authorName: author != null ? author.name : "",
        }
        const articleInfo = Object.assign(name, article._doc)

        const next = await Article.find({
            date: { $gt: article.date },
        }).limit(1)

        const prev = await Article.find({
            date: { $lt: article.date },
        })
            .sort({ _id: -1 })
            .limit(1)

        const files = await File.find({ articleId: _id }).select("originName")

        await Article.findByIdAndUpdate(_id, {
            $set: { views: ++article.views },
        }).exec()

        articleInfo.isMine =
            req.session.authorization == articleInfo.author ||
            req.session.authorization == "admin"
        res.json({ articleInfo, next, prev, files }).status(200)
    } catch (e) {
        console.log("error: ", e)
        res.status(404).send({ message: "No Post" })
    }
})

// 첨부파일 download (파일 _id 기반)
router.get("/download/:id", async (req, res) => {
    const _id = req.params.id
    const file = await File.findById(_id)
    if (!file) {
        return res.status(404).send({ message: "This is Recomment" })
    }
    const filePath = "uploadFiles/" + file.newName
    // 파일 없는거 처리해서 없으면 404 에러 보내줘야 할 것 같다.

    res.download(filePath, file.originName, (e) => {
        if (e) {
            console.log("error: ", e)
            res.status(500).send({ message: "Server Error" })
        }
    })
})

// 게시물 update (_id 기반)
router.patch("/:id", verifyUser, upload.array("fileList"), async (req, res) => {
    const _id = req.params.id

    // 수정 권한 조회
    if (!(await checkPermission(req, res, _id, Article))) return

    req.body = JSON.parse(req.body.data)

    // 공지사항 
    if (
        req.body.tag === "notice" &&
        (await isUserClassOne(req.session.authorization))
    ) {
        return res.status(401).send({ message: "No Permission" })
    }

    const updateKeys = Object.keys(req.body)
    const allowedKeys = ["title", "content", "tag", "deletedFile"] // 변경 가능한 것
    const isValid = updateKeys.every((key) => allowedKeys.includes(key))
    if (!isValid) {
        return res.status(400).send({ message: "Cannot Update" })
    }

    // deletedFile 삭제
    req.body.deletedFile.forEach(async (file) => {
        const fileDoc = await File.findById(file._id)

        // 서버의 uploadFiles에서 제거
        fs.unlink("uploadfiles/" + fileDoc.newName, (e) => {
            if (e) console.log("error: ", e)
        })

        await File.deleteOne({ _id: file._id })
    })
    delete req.body.deletedFile

    // fileList 추가
    if (req.files.length != 0) { 
        const newFileList = new Array()
        await addFiles(_id, req.files, newFileList)
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
    if (!(await checkPermission(req, res, _id, Article))) return

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

        //Delete Report
        await Report.deleteMany({ articleId: _id })

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
