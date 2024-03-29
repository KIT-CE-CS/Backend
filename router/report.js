const express = require("express")
const router = express.Router()
const Article = require("../schemas/article")
const Comment = require("../schemas/comment")
const Report = require("../schemas/report")
const { verifyUser, checkAdmin } = require("./middlewares/authorization")
const paging = require("./js/pagination")

router.post("/", verifyUser, async (req, res) => {
    const { id } = req.body
    const { targetType } = req.body
    const { reason } = req.body

    try {
        if (targetType === "article") {
            let newReport = new Report({
                reporter: req.session.authorization,
                articleId: id,
                targetType: targetType,
                reason: reason,
            })
            await newReport.save()
            res.status(200).send({ message: "Article Reported!!" })
        } else if (targetType === "comment") {
            let _articleId
            let doc = await Article.findOne({
                commentList: { $in: [id] },
            })
            if(doc == null) {
                doc = await Comment.findOne({
                    commentList: { $in: [id] },
                })
                _articleId = doc.articleId
            }
            else 
                _articleId = doc._id
            let newReport = new Report({
                reporter: req.session.authorization,
                articleId: _articleId,
                commentId: id,
                targetType: targetType,
                reason: reason,
            })
            await newReport.save()
            res.status(200).send({ message: "Comment Reported!!" })
        } else {
            res.status(404).send({ message: "Not Found" })
        }
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

const addContent = async (doc) => {
    const comment = await Comment.findById(doc.commentId)
    const commentInfo = { 
        content: comment.content
    }
    const info = Object.assign(commentInfo, doc._doc)
    return info
}

router.get("/", async (req, res) => {
    const { page } = req.query
    const { limit } = req.query
    try {
        const totalReport = await Report.countDocuments({})
        let { startPage, endPage, hidePost, postLimit, totalPages, pageNum } =
            paging(page, totalReport, limit)

        let reports = await Report.find({})
            .sort({ createAt: -1 })
            .skip(hidePost)
            .limit(postLimit)

        reports = await Promise.all(
            reports.map(async (report) => {
                if (report.targetType === "comment")
                    return await addContent(report)
                else
                    return report
            })
        )

        res.json({
            reports,
            pageNum,
            startPage,
            endPage,
            postLimit,
            totalPages,
            totalReport
        }).status(200)
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

// 게시물 삭제없이 신고 내역을 삭제하기 위함
router.delete("/:id", verifyUser, checkAdmin, async (req, res) => {
    const { id } = req.params
    try {
        // 신고 내역 삭제
        await Report.findByIdAndDelete(id)
        res.status(200).send({ message: "Success" })
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

module.exports = router