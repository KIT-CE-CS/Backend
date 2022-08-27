const express = require("express")
const router = express.Router()
const User = require("../schemas/user")
const Article = require("../schemas/article")
const Comment = require("../schemas/comment")
const nodemailer = require("nodemailer")
const verifyEmail = require("../secret.js").verifyEmail
const crypto = require("crypto")
const { findOneAndUpdate, findOneAndDelete, findOne, findById, findByIdAndUpdate } = require("../schemas/article")
require("dotenv").config()
const verifyUser = require("./middlewares/authorization").verifyUser

//const path = require("path")
// var appDir = path.dirname(require.main.filename)

router.get("/findID", async (req, res) => {
    User.findOne({ webmail: req.body.webmail, name: req.body.name} ,async (e, user) => {
        if (!user) {
            return res.status(404).send({ message: "Not exist" })
        }
        if (e) {
            console.log("error: ", e)
            return res.status(500).send({ message: "Server Error" })
        }

        return res.json(user.id).status(200)
    })
})

router.get("/userdelete", (req,res) => {
    User.deleteOne({name: "김원렬"})
})

router.get("/findPassword", async (req, res) => {
    try
    {
    User.findOne({ id: req.body.id, name: req.body.name} ,async (e, user) => {
        if (!user) {
            return res.status(404).send({ message: "Not exist" })
        }
        if (e) {
            console.log("error: ", e)
            return res.status(500).send({ message: "Server Error" })
        }
        
        const email = user.webmail
        const toHash = `${user.id}${user.name}${user.webmail}`
        const code = crypto.createHash("sha256").update(toHash).digest("hex")

        let transporter = nodemailer.createTransport({
            service: "naver",
            auth: {
                user: verifyEmail.id,
                pass: verifyEmail.pw,
            },
        })

        let mailOptions = {
            from: verifyEmail.id,
            to: email, // 대상 메일 주소 req.body.email
            subject: "[ACS]비밀번호 초기화 메일 인증", // 메일 제목
            html: `
            <div style="border: black 2px solid; border-radius: 1rem; margin-right: 1rem; padding: 1rem; text-align: center; max-width: 500px;">
                <div style="font-size: 2rem">비밀번호 변경</div></br>
                <div style="font-size: 1.2rem">
                    아래 버튼을 눌러서 비밀번호 변경을 진행해주세요.
                </div>
                </br>
                <div style="margin: 0.2rem;">
                    <a 
                        style="background-color: lightblue; border-radius: 10px; padding: 0.5rem;"
                        href='http://localhost:3001/sign/changePassword?code=${code}&email=${email}'>비밀번호 변경하기</a>
                </div>
            </div>
            `,
        }

        transporter.sendMail(mailOptions, function (e, info) {
            if (e) {
                console.log("error: ", e)
                res.status(500).send({ message: "Server Error" })
            } else console.log("Email sent: " + info.response)
            transporter.close()
        })
        res.status(201).send("메일 보내기 성공")
    })
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

//비번 바꾸는 거니까  post로 했으면 좋겠는데 url 들어가면 기본이 get이니까 get으로 일단 함


router.get("/changePassword", (req, res) => {
    
    //이거 해야 대나?
    let toHash, code
    User.findOne({webmail: req.query.email} ,async (e, user) => {
        user.password =  req.body.newPassword
        console.log(user.password)
        await user.save()
        console.log(user)
    })
})


//    if (code === req.query.code) {
//        return res.status(200).send({ message: "Success" })
//   } else {
//        return res.status(403).send({ message: "Invalid code" })
//   }


router.post("/up", async (req, res) => {
    User.find((e, user) => {
        if (e) console.log(e)
        else console.log(user)
    })
    req.body.webmail += "@kumoh.ac.kr"

    try {

        const dupId = await User.findOne({ id: req.body.id })
        const dupWebmail = await User.findOne({ webmail: req.body.webmail })
        if (dupId)
            return res.status(403).send({ message: "사용중인 아이디입니다." })
        if (dupWebmail)
            return res.status(403).send({ message: "사용중인 이메일입니다." })

        /*

        const emailValid = /^[0-9a-zA-Z]([-_.]?[0-9a-zA-Z])*@kumoh\.ac.kr$/

        if (!emailValid.test(email)) {
            return res.json({
                message: "금오공과대학교 웹메일을 통한 가입만 가능합니다 :)",
            })
        }
        */
        let email = req.body.webmail

        // 인증방법: 인증사이트 링크 클릭을 통해 인증
        const toHash = `${req.body.id}${req.body.name}${req.body.webmail}`
        const code = crypto.createHash("sha256").update(toHash).digest("hex")

        let transporter = nodemailer.createTransport({
            service: "naver",
            auth: {
                user: verifyEmail.id,
                pass: verifyEmail.pw,
            },
        })

        let mailOptions = {
            from: verifyEmail.id,
            to: email, // 대상 메일 주소 req.body.email
            subject: "[ACS]회원가입 메일 인증", // 메일 제목
            html: `
            <div style="border: black 2px solid; border-radius: 1rem; margin-right: 1rem; padding: 1rem; text-align: center; max-width: 500px;">
                <div style="font-size: 2rem">이메일 인증</div></br>
                <div style="font-size: 1.2rem">
                    아래 버튼을 눌러 인증을 완료해주세요.
                </div>
                </br>
                <div style="margin: 0.2rem;">
                    <a 
                        style="background-color: lightblue; border-radius: 10px; padding: 0.5rem;"
                        href='http://localhost:3001/sign/confirmEmail?code=${code}&email=${email}'>이메일 인증하기</a>
                </div>
            </div>
            `,
        }

        transporter.sendMail(mailOptions, function (e, info) {
            if (e) {
                console.log("error: ", e)
                res.status(500).send({ message: "Server Error" })
            } else console.log("Email sent: " + info.response)
            transporter.close()
        })

        let user = new User({
            id: req.body.id,
            password: req.body.password,
            name: req.body.name,
            webmail: req.body.webmail,
            verify: false,
        })
        user.save((e) => {
            if (e) {
                console.log("error: ", e)
                res.status(500).send({ message: "Server Error" })
            }
        })
        res.status(201).send("사용자 가입 완료")
    } catch (e) {
        console.log("error: ", e)
        res.status(500).send({ message: "Server Error" })
    }
})

// 아이디 중복 확인
router.get("/dupId", async (req, res) => {
    if (!req.query.id) return res.status(404).send({ message: "No User" })

    const dupId = await User.findOne({ id: req.query.id })
    if (dupId) return res.status(403).send({ message: "Duplicated Id" })
    else return res.status(200).send({ message: "OK" })
})

// 이메일 중복 확인
router.get("/dupWebmail", async (req, res) => {
    req.query.webmail += "@kumoh.ac.kr"
    if (!req.query.webmail) return res.status(404).send({ message: "No User" })

    const dupWebmail = await User.findOne({ webmail: req.query.webmail })
    if (dupWebmail) return res.status(403).send({ message: "Duplicated Webmail" })
    else return res.status(200).send({ message: "OK" })
})

// 이메일 인증
router.get("/confirmEmail", (req, res) => {
    userConfirm = User.findOne({ webmail: req.query.email }, (e, user) => {
        if (!user) {
            return res.status(404).send({ message: "Not exist" })
        }
        if (e) {
            console.log("error: ", e)
            res.status(500).send({ message: "Server Error" })
        }

        const _id = user._id
        const toHash = `${user.id}${user.name}${user.webmail}`
        const code = crypto.createHash("sha256").update(toHash).digest("hex")

        if (code === req.query.code) {
            User.findByIdAndUpdate(_id, { $set: { verify: true } }).exec()
            return res.status(200).send({ message: "Success" })
        } else {
            return res.status(403).send({ message: "Invalid code" })
        }
    })
})



//회원 탈퇴
router.delete("/", verifyUser, async (req, res) => {

    User.findOne({ id: req.session.authorization }, async (e, user) => {
        if (!user) {
            return res.status(404).send({ message: "Not exist" })
        }
        if (e) {
            console.log("error: ", e)
            return res.status(500).send({ message: "Server Error" })
        }

        try {
            await user.comparePassword(req.body.password, async (_, isMatch) => {
                if (!isMatch) {
                    return res.status(400).send({ message: "Wrong Password" })
                } else {
    
                    // 게시글 author 변경
                    await Article.updateMany({author: user.id}, {$set: { author: "" }})
    
                    // 댓글, 대댓글 author 변경
                    await Comment.updateMany({author: user.id}, {$set: { author: "" }})
    
                    // 회원 DB에서 삭제
                    const deletedUser = await User.findOneAndDelete({ id: req.session.authorization });
                    if (!deletedUser) {
                        return res.status(404).send({ message: "No User" })
                    }
                    res.status(200).send({ message: "Success" })
                }
            })
        } catch (e) {
            console.log("error: ", e)
            return res.status(500).send({ message: "Server Error" })
        }
    })

})

module.exports = router