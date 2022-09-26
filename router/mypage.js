const express = require("express")
const router = express.Router()
const Article = require("../schemas/article")
const Comment = require("../schemas/comment")
const User = require("../schemas/user")
const bcrypt = require("bcrypt")
const verifyUser = require("./middlewares/authorization").verifyUser
const saltFactor = require("../secret.js").saltFactor
const paging = require("./js/pagination")

// Status Code
// 400 Bad Request
// 401 Unauthorized
// 403 Forbidden
// 404 Not Found
// 500 Internal Server Error

const getArticlesWithCommentCount = async (hide, limit, option) => {
    const articles_ = await Article.find(option)
        .sort({ date: -1 })
        .skip(hide)
        .limit(limit)

    return await Promise.all(
        articles_.map(async (article) => {
            let count = await Comment.countDocuments({ articleId: article._id })
            for (const comment of article.commentList) {
                count += await Comment.countDocuments({articleId: comment._id})
            }
            const info = { 
                commentCount: count
            }
            const articleInfo = Object.assign(info, article._doc)
            return articleInfo
        })
    )
}

// 마이페이지 접속
router.get("/", verifyUser, async (req, res) => {
    const user = await User.findOne({ id: req.session.authorization })
    if (!user) {
        return res.status(403).send({ message: "Forbidden" })
    }
    try {
        const { page, limit } = req.query

        const totalArticle = await Article.countDocuments({ author: user.id })

        let { startPage, endPage, hidePost, postLimit, totalPages, pageNum } =
            paging(page, totalArticle, limit)

        const articles_ = await getArticlesWithCommentCount(
            hidePost,
            postLimit, 
            { author: user.id }
        )

        const userMypage = {
            id: user.id,
            name: user.name,
            email: user.webmail,
            articles: articles_,
        }

        res.json({
            userMypage,
            pageNum,
            startPage,
            endPage,
            postLimit,
            totalPages,
            totalArticle
        }).status(200)
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }


})

// 비밀번호 수정
router.patch("/password", verifyUser, async (req, res) => {
    User.findOne({ id: req.session.authorization }, async (e, user) => {
        if (!user) {
            return res.status(404).send({ message: "Not exist" })
        }
        if (e) {
            console.log("error: ", e)
            return res.status(500).send({ message: "Server Error" })
        }
        await user.comparePassword(req.body.password, (_, isMatch) => {
            if (!isMatch) {
                return res.status(400).send({ message: "Wrong Password" })
            } else {
                User.findOneAndUpdate(
                    { id: req.session.authorization },
                    {
                        $set: {
                            password: bcrypt.hashSync(
                                req.body.newPassword,
                                saltFactor
                            ),
                        },
                    }
                ).exec()
                return res.status(200).send({ message: "OK" })
            }
        })
    })
})

// 유저 등급 변경
router.patch("/class", verifyUser, async (req, res) => {

    // admin 확인
    if (req.session.authorization !== "admin")
        return res.status(401).send({ message: "No Permission" })

    try {
        const user = await User.findOneAndUpdate(
            { id: req.body.id },
            { $set: { class: req.body.class } }
        )

        if (!user) {
            return res.status(404).send({ message: "No User" })
        }
        
        res.status(200).send({ message: "Success" })
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

module.exports = router
