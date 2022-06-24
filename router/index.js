const express = require("express");
const router = express.Router();

const Login = require("./log");
router.use('/log', Login);

const Sign = require("./sign");
router.use('/sign', Sign);

module.exports = router;