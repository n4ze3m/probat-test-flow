const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()


const sleep = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms))
}

const devices = [
    {
        "device_id": "1008.00",
        "command_id": 3,
        "command_value": 1,
        "type": "binary",
        "wait_finish": false,
        "wait_device": []
    },
    {
        "device_id": "100.22",
        "command_id": 3,
        "command_value": 1,
        "type": "binary",
        "wait_finish": false,
        "wait_device": []
    },
    {
        "device_id": "100.26",
        "command_id": 3,
        "command_value": 1,
        "type": "binary",
        "wait_finish": false,
        "wait_device": []
    },
    {
        "device_id": "100.26",
        "command_id": 6,
        "command_value": 2, 
        "type": "input", 
        "wait_finish": true,
        "wait_device": ["100.26"]
    },



    {
        "device_id": "100.18",
        "command_id": 3,
        "command_value": 1,
        "type": "binary", 
        "wait_finish": false,
        "wait_device": []
    },
    {
        "device_id": "100.18",
        "command_id": 6,
        "command_value": 1, 
        "type": "input", 
        "wait_finish": true,
        "wait_device": ["100.18"]
    },

    {
        "device_id": "100.24",
        "command_id": 3,
        "command_value": 1,
        "type": "binary",
        "wait_finish": true,
        "wait_device": ["100.24"]
    },
    {
        "device_id": "100.25",
        "command_id": 3,
        "command_value": 1,
        "type": "binary",
        "wait_finish": true,
        "wait_device": ["100.25"]
    },
    {
        "device_id": "100.23",
        "command_id": 3,
        "command_value": 1,
        "type": "binary",
        "wait_finish": true,
        "wait_device": ["100.23"]
    },
    {
        "device_id": "100.23",
        "command_id": 3,
        "command_value": 0,
        "type": "binary",
        "wait_finish": false,
        "wait_device": []
    },


    {
        "device_id": "100.24",
        "command_id": 3,
        "command_value": 0,
        "type": "binary",
        "wait_finish": false,
        "wait_device": []
    },
    {
        "device_id": "100.25",
        "command_id": 3,
        "command_value": 0,
        "type": "binary",
        "wait_finish": false,
        "wait_device": []
    },
    {
        "device_id": "100.17",
        "command_id": 3,
        "command_value": 1,
        "type": "binary",
        "wait_finish": false,
        "wait_device": []
    }
]


const createLogs = async (device_id, message) => {
    await prisma.events.create({
        data: {
            event_device_id: device_id,
            event_description: message,
            event_time: new Date().toISOString(),
        }
    })
}

const setValues = async (device) => {
    const device_id = device.device_id
    const type = device.type
    const command_id = device.command_id
    const command_value = device.command_value

    switch (type) {
        case "binary":
            await prisma.commands_read.updateMany({
                where: {
                    device_id: device_id,
                    command_id: command_id,
                },
                data: {
                    command_value: command_value,
                    author: 'app'
                }
            })
            await createLogs(device_id, `Set value ${command_value} to command id ${command_id}`)
            break
        case "input":
            await prisma.commands_input_read.updateMany({
                where: {
                    device_id: device_id,
                    command_input_id: command_id
                },
                data: {
                    command_input_value: command_value,
                }
            })
            await createLogs(device_id, `Set value ${command_value} to command id ${command_id}`)
            break
        default:
            break
    }
}


const waitForFinish = async (device) => {
    // create promise to wait for devices to finish
    let isNotFinish = true
    let finished_devices = []
    let wait_device_count = device.wait_device.length
    while (isNotFinish) {
        device.wait_device.forEach(async (device_id) => {
            const finished = await prisma.commands_write.findFirst({
                where: {
                    device_id: device_id,
                    command_id: 126,
                    command_value: 1
                }
            })
            if (finished) {
                // check if device is already in array
                if (finished_devices.length !== wait_device_count) {
                    if (finished_devices.indexOf(device_id) === -1) {
                        finished_devices.push(device_id)
                    }
                }
            }
        })
        if (finished_devices.length === wait_device_count) {
            isNotFinish = false
            finished_devices.forEach(async (device_id) => {
                await createLogs(device_id, `Device ${device_id} finished`)
            })
            console.log("Waiting is over")
        }
        await sleep(1000)
    }

    return true
}

const main = async () => {
    try {
        for (const device of devices) {
            console.log(`Start device ${device.device_id}`)
            await setValues(device)
            if (device.wait_finish) {
                console.log(`Wait for devices to finish`)
                await waitForFinish(device)
            }
            await sleep(2000)
            console.log(`Done`, device.device_id)
        }
    } catch (e) {
        console.log(e)
    }
}

main()