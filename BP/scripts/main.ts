import { world, system, Player, Vector3, EntityQueryOptions } from '@minecraft/server';
import { ActionFormData, MessageFormData, ModalFormData } from '@minecraft/server-ui';

const shovelID = "lca:claim_shovel"
const claimIcons = {

    // name: path
    "ui.claim.icons:land": "textures/ui/icon_recipe_nature.png",
    "ui.claim.icons:bed": "textures/ui/icon_recipe_item.png",
    "ui.claim.icons:farmland": "textures/ui/icon_new.png",
    "ui.claim.icons:weapons": "textures/ui/icon_recipe_equipment.png",
    "ui.claim.icons:flowers": "textures/ui/icon_spring.png"
};

const dbPlayerDefault = {
    "first-point": {
        "x": 0,
        "y": 0,
        "z": 0
    },
    "claims": {}
}

const dbPermissionsDefault = {
    "break-blocks": false,
    "use-items-on-blocks": false,
    "use-tnt": false,
    "hurt-entities": false
}

const dbClaimDefault = {
    "start": { "x": 0, "y": 0, "z": 0 },
    "end": { "x": 0, "y": 0, "z": 0 },

    "icon": "",

    "particles": true,

    "private": false,

    "permissions": {
        "public": { ...dbPermissionsDefault },
        "players": {}
    }
}

// check if database property exsists
if (!(world.getDynamicPropertyIds().includes("db"))) {
    world.setDynamicProperty("db", "{}")
}

// load the database property in a dict
var database: {} = JSON.parse(world.getDynamicProperty("db").toString());

// verify that database contains correct properties
for (var player of Object.keys(database)) {
    database[player] = { ...dbPlayerDefault, ...database[player] }

    // verify data in claims: {}
    for (var claim of Object.keys(database[player]["claims"])) {
        database[player]["claims"][claim] = { ...dbClaimDefault, ...database[player]["claims"][claim] }

        // verify data in player: {}
        for (var permission_player of Object.keys(database[player]["claims"][claim]["permissions"]["players"])) {
            database[player]["claims"][claim]["permissions"]["players"][permission_player] = {
                ...dbPermissionsDefault,
                ...database[player]["claims"][claim]["permissions"]["players"][permission_player]
            }
        }
    }
}

function saveDb() {
    world.setDynamicProperty("db", JSON.stringify(database));
}

function sendNotification(player: Player, langEntry: String) {
    player.runCommandAsync(`tellraw @s {"rawtext":[{"translate":"chat.prefix"}, {"text":" "}, {"translate":"${langEntry}"}]}`);
}

// // Returns true if two claims (l1, r1) and (l2, r2) overlap 
function doOverlap(l1: Vector3, r1: Vector3, l2: Vector3, r2: Vector3) {
    // Get the left, right, bottom, and top coordinates of each rectangle
    const rect1Left = Math.min(l1.x, r1.x);
    const rect1Right = Math.max(l1.x, r1.x);
    const rect1Top = Math.max(l1.z, r1.z);
    const rect1Bottom = Math.min(l1.z, r1.z);

    const rect2Left = Math.min(l2.x, r2.x);
    const rect2Right = Math.max(l2.x, r2.x);
    const rect2Top = Math.max(l2.z, r2.z);
    const rect2Bottom = Math.min(l2.z, r2.z);

    // Check if there's no overlap on both x and y directions
    return !(rect1Right < rect2Left || rect2Right < rect1Left || rect1Top < rect2Bottom || rect2Top < rect1Bottom);
}

// returns if a visitor has specified permission
function hasPermission(claim: {}, permission: string, player: Player = undefined) {
    var playerPermissions = claim["permissions"]["players"];

    // check if player is in specific permissions list
    if ((player != undefined) && player.name in Object.keys(playerPermissions)) {
        if (permission in Object.keys(playerPermissions[player.name])) {
            return playerPermissions[player.name][permission]
        }
    }
    // default to claims global permissions list
    else {
        if (permission in Object.keys(claim["permissions"]["public"])) {
            return (claim["permissions"]["public"][permission]);
        }
    }
    // permission not found
    return (false);
}

class Ui {
    // player selected icons for their claims
    static claimIcons = {
        // name: path
        "ui.claim.icons:land": "textures/ui/icon_recipe_nature.png",
        "ui.claim.icons:bed": "textures/ui/icon_recipe_item.png",
        "ui.claim.icons:farmland": "textures/ui/icon_new.png",
        "ui.claim.icons:weapons": "textures\/ui/icon_recipe_equipment.png",
        "ui.claim.icons:flowers": "textures/ui/icon_spring.png"
    };

    static main(player: Player) {
        var claims: {} = database[player.name]["claims"];

        const form = new ActionFormData()
            .title("ui.main:title")
            .button("ui.main.button:manage", "textures/ui/icon_setting.png")
            .button("ui.main.button:close")

        form.show(player).then((response) => {
            if (response.selection == 0) {
                if (Object.keys(claims).length == 0) {
                    sendNotification(player, "chat.claim:no_claims");
                    player.playSound("note.didgeridoo");
                }
                else {
                    this.manage(player);
                }
            }
        });
    }

    static newClaim(player: Player, start: Vector3, end: Vector3) {
        var claims: {} = database[player.name]["claims"];

        const form = new ModalFormData()
            .title("ui.claim.new:title")
            .textField("ui.claim.config.textbox:name", "ui.claim.config:name_placeholder")
            .dropdown("ui.claim.config.dropdown:icon", Object.keys(claimIcons))
            .toggle("ui.claim.config.toggle:private", false)
            .toggle("ui.claim.config.toggle:border_particles", true)

        form.show(player).then((response) => {

            if (!response.canceled) {

                var name = response.formValues[0].toString();
                var iconPath = claimIcons[Object.keys(claimIcons)[response.formValues[1].toString()]];
                var isPrivate = response.formValues[2];
                var showBorderParticles = response.formValues[3];

                if (name.length == 0) {
                    sendNotification(player, "chat.claim:name_required")
                    player.playSound("note.didgeridoo");
                }
                else if (name in claims) {
                    sendNotification(player, "chat.claim:use_unique_name")
                    player.playSound("note.didgeridoo");
                }

                else {
                    // generate dict for the new claim
                    claims[name] = Object.assign({}, dbClaimDefault);

                    // save data
                    claims[name]["start"] = start;
                    claims[name]["end"] = end;
                    claims[name]["icon"] = iconPath;
                    claims[name]["private"] = isPrivate;
                    claims[name]["particles"] = showBorderParticles;

                    sendNotification(player, "chat.claim:created")
                    player.playSound("random.levelup");
                }
            }
            saveDb();

        });
    }

    static manage(player: Player) {
        var claims = database[player.name]["claims"];

        const form = new ActionFormData()
            .title("ui.manage:title")

        for (var c of Object.keys(claims)) {
            if (claims[c]["private"]) {
                var label = "ui.manage.label:private"
            }
            else {
                var label = "ui.manage.label:public"
            }
            form.button(
                {
                    "rawtext": [
                        { "text": `${c}\n` },
                        { "translate": label }
                    ]
                }, claims[c]["icon"]);
        }

        form.button("ui.global.button:back")

        form.show(player).then((response) => {
            if (response.selection == Object.keys(claims).length) {
                // return to previous menu
                this.main(player);
            }
            else {
                this.manageClaim(player, Object.keys(claims)[response.selection].toString());
            }
        });
    }

    static manageClaim(player: Player, claim: string) {
        var claims = database[player.name]["claims"];

        const form = new ActionFormData()
            .title({
                "rawtext": [
                    { "translate": "ui.manage:title" },
                    { "text": `: ${claim}` }
                ]
            })
            .body({
                "rawtext": [
                    { "text": "\n" },
                    { "translate": "ui.manage.body:claim_start" },
                    { "text": `:  §cX§r=${claims[claim]["start"]["x"]} §9Z§r=${claims[claim]["start"]["z"]}\n\n` },
                    { "translate": "ui.manage.body:claim_end" },
                    { "text": `: §cX§r=${claims[claim]["end"]["x"]} §9Z§r=${claims[claim]["end"]["z"]}\n ` }
                ]
            })
            .button("ui.manage.button:config", "textures/ui/debug_glyph_color.png")
            .button("ui.manage.button:public_permissions", "textures/ui/icon_multiplayer.png")
            .button("ui.manage.button:player_permissions", "textures/ui/icon_steve.png")
            .button("ui.manage.button:sell", "textures/ui/icon_trash.png")
            .button("ui.global.button:back")

        form.show(player).then((response) => {
            if (response.selection == 0) {
                this.claimConfig(player, claim);
            }
            else if (response.selection == 1) {

            }
            else if (response.selection == 2) {
                this.publicPermissions(player, claim);
            }
            else if (response.selection == 3) {
                this.sellClaim(player, claim);
            }
            else if (response.selection == 4) {
                // return to previous menu
                this.manage(player);
            }
        });
    }

    static sellClaim(player: Player, claim: string) {
        var claims: {} = database[player.name]["claims"];

        const form = new MessageFormData()
            .title(claim)
            .body("ui.manage.sell:body")
            .button1("ui.manage.sell.button:cancel")
            .button2("ui.manage.sell.button:confirm")

        form.show(player).then((response) => {
            // if deletion canceled
            if (response.selection == 0) {

                // return to previous page on menu
                this.manageClaim(player, claim);
            }
            else if (response.selection == 1) {

                // delete claim
                delete claims[claim];
                sendNotification(player, "chat.claim:sold")
                player.playSound("mob.creeper.say");

                saveDb();
            }
        });
    }

    static claimConfig(player: Player, claim: string) {
        var claims: {} = database[player.name]["claims"];

        const form = new ModalFormData()
            .title({
                "rawtext": [
                    { "translate": "ui.manage.config:title" },
                    { "text": `: ${claim}` }
                ]
            })
            .textField("ui.claim.config.textbox:name", "ui.claim.config:name_placeholder", claim)
            .dropdown("ui.claim.config.dropdown:icon", Object.keys(claimIcons), Object.values(claimIcons).indexOf(claims[claim]["icon"]))
            .toggle("ui.claim.config.toggle:private", claims[claim]["private"])
            .toggle("ui.claim.config.toggle:border_particles", claims[claim]["particles"])

        form.show(player).then((response) => {

            if (!response.canceled) {

                var name = response.formValues[0].toString();
                var iconPath = claimIcons[Object.keys(claimIcons)[response.formValues[1].toString()]];
                var isPrivate = response.formValues[2];
                var showBorderParticles = response.formValues[3];

                if (name.length == 0) {
                    sendNotification(player, "chat.claim:name_required")
                    player.playSound("note.didgeridoo");
                }
                else {

                    if (claim != name) {
                        // copy the claim over to the new name key
                        claims[name] = Object.assign({}, claims[claim]);

                        // delete the old name key
                        delete claims[claim];
                    }

                    claims[name]["private"] = isPrivate;
                    claims[name]["icon"] = iconPath;
                    claims[name]["particles"] = showBorderParticles;

                    sendNotification(player, "chat.claim:updated")
                    player.playSound("note.cow_bell");
                }
            }
            saveDb();

        });
    }

    static publicPermissions(player: Player, claim: string) {

    }
}

world.afterEvents.playerJoin.subscribe((data) => {
    // verify player data is on file

    // set up player database
    if (!(data.playerName in database)) {

        database[data.playerName] = Object.assign({}, dbPlayerDefault);
    }

    // save changes to the database
    saveDb();

});

world.afterEvents.playerSpawn.subscribe((data) => {
    // make sure player has a claim shovel
    data.player.runCommandAsync(`execute if entity @s[hasitem = { item=${shovelID}, quantity = 0}] run give @s ${shovelID} 1 0 { "keep_on_death": { }, "item_lock": { "mode": "lock_in_inventory" } } `);
});

// open menu when claim shovel is used
world.afterEvents.itemUse.subscribe((data) => {
    if (data.itemStack.typeId == shovelID) {
        Ui.main(data.source);
    };
});

world.beforeEvents.itemUseOn.subscribe((data) => {
    if (data.block.dimension == world.getDimension("overworld")) {
        for (var player of Object.keys(database)) {
            var claims = database[player]["claims"]

            for (var claim of Object.keys(claims)) {

                // check if a block is broken by a player without permissions within the claim
                if (doOverlap(claims[claim]["start"], claims[claim]["end"], data.block, data.block) && (player != data.source.name) && !hasPermission(claims[claim], "use-items-on-blocks", data.source)) {
                    data.cancel = true;

                    system.run(() => {
                        sendNotification(data.source, "chat.claim.permission:use_item_on_block");
                        data.source.playSound("note.didgeridoo");
                    })
                }
            }
        }
    }
});

// Set/adjust claim points if player is sneaking
world.beforeEvents.playerBreakBlock.subscribe((data) => {
    // handle creating claims by setting first and second point
    if ((data.itemStack != undefined) && (data.itemStack.typeId == shovelID)) {
        // stop the shovel from breaking the block
        data.cancel = true

        if (data.dimension == world.getDimension("overworld")) {

            var firstPoint = database[data.player.name]["first-point"];

            if (!data.player.isSneaking) {
                firstPoint["x"] = data.block.x;
                firstPoint["y"] = data.block.y;
                firstPoint["z"] = data.block.z;

                data.player.sendMessage({
                    "rawtext": [
                        { "translate": "chat.prefix" },
                        { "text": " " },
                        { "translate": "chat.claim.point:selected" },
                        { "text": `: [§c${data.block.x}§r, §a${data.block.y}§r, §9${data.block.z}§r]\n` },
                        { "translate": "chat.claim.point:hint" }
                    ]
                });
                system.run(() => {
                    data.player.playSound("note.cow_bell")
                });
            }
            else {
                var secondPoint = { "x": data.block.x, "y": data.block.y, "z": data.block.z }
                var intersectingClaim = false;

                // make sure new claim isn't intersecting others
                for (var player of Object.keys(database)) {
                    var claims = database[player]["claims"]

                    for (var claim of Object.keys(claims)) {
                        if (doOverlap(claims[claim]["start"], claims[claim]["end"], firstPoint, secondPoint)) {
                            intersectingClaim = true;
                        }
                    }
                }

                if (intersectingClaim) {
                    sendNotification(data.player, "chat.claim:intersecting")

                    system.run(() => {
                        data.player.playSound("note.didgeridoo")
                    });
                }
                else {
                    system.run(() => {
                        data.player.playSound("note.cow_bell");

                        Ui.newClaim(data.player, { ...firstPoint }, secondPoint);
                    });
                }

            }

            // save changes to the database
            saveDb();

        }
        else {
            sendNotification(data.player, "chat.shovel:dimension_warning");
            system.run(() => {
                data.player.playSound("note.didgeridoo");
            });
        }

    }
    else {
        if (data.dimension == world.getDimension("overworld")) {
            for (var player of Object.keys(database)) {
                var claims = database[player]["claims"]

                for (var claim of Object.keys(claims)) {

                    // check if a block is broken by a player without permissions within the claim
                    if (doOverlap(claims[claim]["start"], claims[claim]["end"], data.block, data.block) && (player != data.player.name) && !hasPermission(claims[claim], "break-blocks", data.player)) {
                        data.cancel = true;

                        system.run(() => {
                            sendNotification(data.player, "chat.claim.permission:break_blocks");
                            data.player.playSound("note.didgeridoo");
                        })

                    }
                }
            }
        }
    }
});

world.beforeEvents.explosion.subscribe((data) => {

    if (data.dimension == world.getDimension("overworld")) {

        var impactedBlocks = data.getImpactedBlocks();

        var closestPlayer: Player = undefined;

        // find player closest to the explosion, we'll assume this is the player that placed the tnt
        for (var p of world.getPlayers()) {
            if ((closestPlayer == undefined) || (Math.cbrt(Math.pow(p.location.x, 3) + Math.pow(p.location.y, 3) + Math.pow(p.location.z, 3)) < (Math.cbrt(Math.pow(closestPlayer.location.x, 3) + Math.pow(closestPlayer.location.y, 3) + Math.pow(closestPlayer.location.z, 3))))) {
                closestPlayer = p;
            }
        }

        // check if tnt blast effects a claim
        for (var player of Object.keys(database)) {
            var claims = database[player]["claims"]

            for (var claim of Object.keys(claims)) {

                world.sendMessage("" + (data.source.typeId != "minecraft:tnt"))

                // if entity is a mob or player doesn't have permissions
                if ((data.source.typeId != "minecraft:tnt") || !((closestPlayer.name == player) || hasPermission(claims[claim], "use-tnt", closestPlayer))) {
                    world.sendMessage("hi")
                    // remove all impacted blocks that lie within a claim
                    for (var i = 0; i < impactedBlocks.length; i++) {
                        var block = impactedBlocks[i]

                        if (doOverlap(claims[claim]["start"], claims[claim]["end"], block, block)) {
                            // remove the block
                            impactedBlocks.splice(impactedBlocks.indexOf(block), 1);

                            // account for deletion
                            i--;
                        }
                    }
                }
            }
        }

        // update impacted blocks
        data.setImpactedBlocks(impactedBlocks);

        // if tnt effected a claim notify player
        if (data.source.typeId == "minecraft:tnt") {
            system.run(() => {
                sendNotification(closestPlayer, "chat.claim.permission:use_tnt");
                closestPlayer.playSound("note.didgeridoo");
            });
        }

    }
});
// world.afterEvents.entityDie.subscribe((data) => {
//     world.sendMessage("test");
// });

world.afterEvents.entityHurt.subscribe((data) => {
    data.hurtEntity.applyDamage(1000);
    // world.sendMessage(data.damageSource.damagingEntity.nameTag)
});
// world.afterEvents.entityHitEntity.subscribe((data) => {
//     // notify a player they don't have permissions to hurt entities
//     // preventing players from doing such action will be handeled by the runInterval loop
//     world.sendMessage("entity hit");
//     world.sendMessage("" + data.damagingEntity.nameTag);
//     // var player = undefined

//     // if (data.damagingEntity.typeId == "minecraft:player"){

//     // }

//     // for (var player of Object.keys(database)) {
//     //     var claims = database[player]["claims"]

//     //     for (var claim of Object.keys(claims)) {
//     //         // if player is in claim
//     //         data.damagingEntity.sendMess
//     //         if ((data.damagingEntity.typeId == "minecraft:player"))
//     //     }
//     // }
// });

// runs code every 1 second
system.runInterval(() => {

    // create particles
    for (var player of Object.keys(database)) {
        var claims = database[player]["claims"]

        for (var claim of Object.keys(claims)) {
            // user defined start and end points of the claim
            var start = claims[claim]["start"];
            var end = claims[claim]["end"];

            // all 4 points of the claim
            var points = [
                [[start["x"], start["z"]], [start["x"], end["z"]]],
                [[end["x"], start["z"]], [end["x"], end["z"]]]
            ]

            var averageY = (start["y"] + end["y"]) / 2
            var numSegments = 3 // the number of border particle segments to generate above and below the average y level
            var segmentHeight = 10
            var averageOffset = (segmentHeight * numSegments)

            // only render if particles are enabled
            if (claims[claim]["particles"]) {
                // loop through all claim points to determine particle type
                for (var a = 0; a < points.length; a++) {
                    for (var b = 0; b < points[a].length; b++) {

                        // only render if claim point is in render distance
                        if (world.getDimension("overworld").getBlock({ "x": points[a][b][0], "y": averageY, "z": points[a][b][1] }) != undefined) {

                            // creates sets of verticle claim particles 20 blocks below and above the claim
                            for (var i = averageY - averageOffset; i <= averageY + averageOffset; i += segmentHeight) {
                                if (points[a][b][0] > points[a ^ 1][b][0]) {
                                    var xParticleType = "lca:negx_claim_particle";
                                }
                                else {
                                    var xParticleType = "lca:posx_claim_particle";
                                }

                                if (points[a][b][1] > points[a][b ^ 1][1]) {
                                    var yParticleType = "lca:negz_claim_particle";
                                }
                                else {
                                    var yParticleType = "lca:posz_claim_particle";
                                }
                                world.getDimension("overworld").runCommand(`particle ${xParticleType} ${points[a][b][0]} ${i} ${points[a][b][1]}`);
                                world.getDimension("overworld").runCommand(`particle ${yParticleType} ${points[a][b][0]} ${i} ${points[a][b][1]}`);
                                world.getDimension("overworld").runCommand(`particle lca:rising_claim_particle ${points[a][b][0]} ${i} ${points[a][b][1]}`);
                                world.getDimension("overworld").runCommand(`particle lca:falling_claim_particle ${points[a][b][0]} ${i} ${points[a][b][1]}`);
                            }
                        }
                    }
                }
            }
        }
    }
}, 20);

