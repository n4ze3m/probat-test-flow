require("dotenv/config")
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()


const sleep = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms))
}

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
    const wait_device = device.wait_device.split(',')
    let wait_device_count = wait_device.length
    while (isNotFinish) {
        wait_device.forEach(async (device_id) => {
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

const waitForRoasting = async (device) => {

    const device_id = device.device_id
    const is_roaster = await prisma.devices.findFirst({
        where: {
            device_id,
            device_type: "Roaster"
        }
    })

    if (is_roaster) {
        let isNotFinish = true

        while (isNotFinish) {
            const finished = await prisma.commands_write.findFirst({
                where: {
                    device_id: device_id,
                    command_id: 125,
                    command_value: 1
                }
            })
            if (finished) {
                isNotFinish = false
                await createLogs(device_id, `Roasting finished`)
            }
            await sleep(1000)
        }

    }

    return true
}

const main = async () => {
    console.log("Worker started")
    while (true) {
        try {
            const pending_works = await prisma.workflow_status.findMany({
                where: { status: true }
            })
            for (const pending of pending_works) {
                if (pending.type === "order") {
                    if (pending.order_id) {
                        const order = await prisma.orders.findFirst({
                            where: {
                                order_id: pending.order_id
                            }
                        })

                        if (order) {
                            await prisma.orders.update({
                                where: {
                                    order_id: order.order_id
                                },
                                data: {
                                    status: 1
                                }
                            })
                            const workflow_id = pending.work_flow_id
                            const devices = await prisma.workflow_logic.findMany({
                                where: {
                                    workflow_id
                                },
                                orderBy: [{
                                    sort_no: 'asc'
                                }]
                            })

                            let split_qty = order.split_qty
                            let initialStart = true
                            while (split_qty > 0) {
                                for (let i = 0; i < devices.length; i++) {
                                    let device = devices[i]
                                    if (initialStart) {
                                        if (device.type === "input" && (device.command_id === 11 || device.command_id === 1)) {
                                            await setValues({
                                                ...device,
                                                command_value: order.split_amt
                                            })

                                        } else {
                                            await setValues(device)
                                        }
                                        if (device.wait_finish) {
                                            await waitForFinish(device)
                                            await prisma.workflow_logs.create({
                                                data: {
                                                    device_id: device.device_id,
                                                    status_id: pending.id,
                                                    workflow_status: pending.id,
                                                    message: `Waiting for device (${device.wait_device}) to finish`
                                                }
                                            })
                                        }
                                        await prisma.workflow_logs.create({
                                            data: {
                                                device_id: device.device_id,
                                                status_id: pending.id,
                                                workflow_status: pending.id,
                                                message: `${device.type} command ${device.command_id} = ${device.command_value}`
                                            }
                                        })
                                        waitForRoasting(device)

                                    } else {
                                        // after initial loop
                                        if (device.type === "input" && (device.command_id === 11 || device.command_id === 1)) {
                                            await setValues({
                                                ...device,
                                                command_value: order.split_amt
                                            })

                                        } else {
                                            await setValues(device)
                                        }
                                        if (device.wait_finish) {
                                            await waitForFinish(device)
                                            await prisma.workflow_logs.create({
                                                data: {
                                                    device_id: device.device_id,
                                                    status_id: pending.id,
                                                    workflow_status: pending.id,
                                                    message: `Device (${device.wait_device}) is finished`
                                                }
                                            })
                                        }
                                        await prisma.workflow_logs.create({
                                            data: {
                                                device_id: device.device_id,
                                                status_id: pending.id,
                                                workflow_status: pending.id,
                                                message: `${device.type} command ${device.command_id} = ${device.command_value}`
                                            }
                                        })
                                        waitForRoasting(device)
                                    }
                                }
                                initialStart = false
                                split_qty = split_qty - order.split_amt
                                await prisma.orders.update({
                                    where: {
                                        order_id: order.order_id
                                    },
                                    data: {
                                        split_qty: split_qty
                                    }
                                })
                            }




                            await prisma.workflow_status.update({
                                where: {
                                    id: pending.id
                                },
                                data: {
                                    status: false
                                }
                            })

                            await prisma.orders.update({
                                where: {
                                    order_id: order.order_id
                                },
                                data: {
                                    status: 4
                                }
                            })

                        }
                    }
                } else {
                    const workflow_id = pending.work_flow_id
                    const devices = await prisma.workflow_logic.findMany({
                        where: {
                            workflow_id
                        },
                        orderBy: [{
                            sort_no: 'asc'
                        }]
                    })

                    for (let i = 0; i < devices.length; i++) {
                        const device = devices[i]
                        console.log(`Start device ${device.device_id}`)
                        await setValues(device)
                        if (device.wait_finish) {
                            await waitForFinish(device)
                            await prisma.workflow_logs.create({
                                data: {
                                    device_id: device.device_id,
                                    status_id: pending.id,
                                    workflow_status: pending.id,
                                    message: `Waiting for device (${device.wait_device}) to finish`
                                }
                            })
                        }
                        await prisma.workflow_logs.create({
                            data: {
                                device_id: device.device_id,
                                status_id: pending.id,
                                workflow_status: pending.id,
                                message: `${device.type} command ${device.command_id} = ${device.command_value}`
                            }
                        })
                        await sleep(2000)
                        if (i === devices.length - 1) {
                            await prisma.workflow_logs.create({
                                data: {
                                    device_id: device.device_id,
                                    status_id: pending.id,
                                    workflow_status: pending.id,
                                    message: `Everything is finished`
                                }
                            })


                            await prisma.workflow_status.update({
                                where: {
                                    id: pending.id
                                },
                                data: {
                                    status: false
                                }
                            })
                        }
                    }
                }
            }
        } catch (e) {
            console.log(e)
        }
        sleep(5000)
    }
}

main()