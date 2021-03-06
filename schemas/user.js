const mongoose = require("mongoose")
const { Schema } = mongoose

const bcrypt = require("bcrypt")
const saltFactor = require("../secret.js").saltFactor

let userSchema = new Schema(
    {
        id: {
            type: String,
            required: true,
        },
        password: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        class: {
            type: Number,
            required: true,
            default: 1
        },
        webmail: {
            type: String,
            required: true,
        },
        verify: {
            type: Boolean,
            required: true,
        },
    },
    {
        versionKey: false,
    }
)

/**
 * 비밀번호 해시
 */
userSchema.pre("save", function (next) {
    let user = this;

    if (!user.isModified("password")) {
        return next()
    } else {
        bcrypt.genSalt(saltFactor, function (err, salt) {
            if (err) return next(err)
            bcrypt.hash(user.password, salt, function (err, hash) {
                if (err) return next(err)
                user.password = hash;
                next()
            })
        })
    }
})

/**
 *
 * @param {*} pw 들어온 비밀번호
 * @param {*} next
 */
userSchema.methods.comparePassword = function (pw, next) {
    bcrypt.compare(pw, this.password, (err, isMatch) => {
        if (err) return next(err)
        next(null, isMatch)
    })
}

module.exports = mongoose.model("user", userSchema)