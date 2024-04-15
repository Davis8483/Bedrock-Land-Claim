import { world, system, Player } from '@minecraft/server';
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
        "is-selected": false,
        "x": 0,
        "y": 0,
        "z": 0
    },
    "claims": {}
}

const dbClaimDefault = {
    "start": [0, 0, 0],
    "end": [0, 0, 0],

    "icon": "",

    "particles": true,

    "private": false,

    "permissions": {
        "public": {
            "break-blocks": false,
            "place-blocks": false,
            "use-explosives": false
        },
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
                "break-blocks": false,
                "place-blocks": false,
                "use-explosives": false,
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

class Ui {
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

    static newClaim(player: Player, start: [x: number, y: number, z: number], end: [x: number, y: number, z: number]) {
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
                    { "text": `:  §cX§r=${claims[claim]["start"][0]} §9Z§r=${claims[claim]["start"][2]}\n\n` },
                    { "translate": "ui.manage.body:claim_end" },
                    { "text": `: §cX§r=${claims[claim]["end"][0]} §9Z§r=${claims[claim]["end"][2]}\n ` }
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

    // reset claim shovel selection
    database[data.playerName]["first-point"]["is-selected"] = false;

    // save changes to the database
    saveDb();

});

world.afterEvents.playerSpawn.subscribe((data) => {
    // make sure player has a claim shovel
    data.player.runCommandAsync(`execute if entity @s[hasitem = { item=${shovelID}, quantity = 0}] run give @s ${shovelID} 1 0 { "keep_on_death": { }, "item_lock": { "mode": "lock_in_inventory" } } `);
});

// open menu when claim shovel is used
world.afterEvents.itemUse.subscribe((data) => {
    // world.sendMessage(JSON.stringify(database));

    if (data.itemStack.typeId == shovelID) {
        Ui.main(data.source);
    };
});

world.beforeEvents.itemUseOn.subscribe((data) => {
    world.sendMessage("" + data.itemStack.getTags());


    // if (!(data.itemStack.getCanPlaceOn().length == 0)) {
    //     world.sendMessage("your not allowed to place blocks");
    // }

    // if (data.itemStack.typeId != shovelID) {

    //     world.sendMessage("your not allowed to place blocks");

    //     data.cancel = true;
    // }

});

// Set/adjust claim points if player is sneaking
world.beforeEvents.playerBreakBlock.subscribe((data) => {

    // handle creating claims by setting first and second point
    if (data.itemStack.typeId == shovelID) {
        // stop the shovel from breaking the block
        data.cancel = true

        var firstPoint = database[data.player.name]["first-point"];

        if (!firstPoint["is-selected"]) {
            firstPoint["is-selected"] = true;

            firstPoint["x"] = data.block.x;
            firstPoint["y"] = data.block.y;
            firstPoint["z"] = data.block.z;

            data.player.runCommandAsync("/particle lca:first_point " + data.block.x + " " + (data.block.y + 1) + " " + data.block.z)
            data.player.sendMessage("First point selected: (" + data.block.x + ", " + data.block.y + ", " + data.block.z + ")");

        }
        else {
            firstPoint["is-selected"] = false;

            world.sendMessage("Second point selected");

            system.run(() => {
                Ui.newClaim(data.player, [firstPoint["x"], firstPoint["y"], firstPoint["z"]], [data.block.x, data.block.y, data.block.z]);
            });

        }

        // save changes to the database
        saveDb();

    }
});

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
                [[start[0], start[2]], [start[0], end[2]]],
                [[end[0], start[2]], [end[0], end[2]]]
            ]

            // only render particle if claim is loaded and particles are enabled
            if ((world.getDimension("overworld").getBlock({ "x": start[0], "y": start[1], "z": start[2] }) != undefined) && (claims[claim]["particles"])) {
                // loop through all claim points to determine particle type
                for (var a = 0; a < points.length; a++) {
                    for (var b = 0; b < points[a].length; b++) {

                        // creates sets of verticle claim particles from the bottom to top of the world
                        for (var i = -60; i < 320; i += 10) {
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
}, 20);

