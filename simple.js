// const moment = require('moment-timezone')
// const checkDate = moment().subtract(1, "day").toISOString()

console.log(null==false);

function test(first, bool){
    if (!first && !bool){
        return "both are false"
    }
    return "at least one is true"
}

console.log(test(false));