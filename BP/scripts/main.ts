import { world, system, Player, Vector3, ItemStack, CameraFadeOptions, CameraSetPosOptions, EasingType } from '@minecraft/server';
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
    "in-claim": false,
    "viewing-claim": false,
    "first-point": {
        "x": 0,
        "y": 0,
        "z": 0,
        "resizing-claim": "",
        "opposite-corner": {
            "x": 0,
            "y": 0,
            "z": 0
        }
    },
    "claims": {}
}

// player specific permissions
const dbPlayerPermissionsDefault = {
    "enter-claim": true,
    "break-blocks": false,
    "use-items-on-blocks": false,
    "hurt-entities": false
}

// global claim permissions
const dbPermissionsDefault = {
    "enter-claim": true,
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
                ...dbPlayerPermissionsDefault,
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
    if ((player != undefined) && Object.keys(playerPermissions).includes(player.name)) {
        if (Object.keys(playerPermissions[player.name]).includes(permission)) {

            return playerPermissions[player.name][permission]
        }
    }
    // default to claims global permissions list
    else {
        if (Object.keys(claim["permissions"]["public"]).includes(permission)) {

            return (claim["permissions"]["public"][permission]);
        }
    }

    // permission not found
    return (false);
}

/**
 * Runs the callback for every claim saved in the database
 */
function runInClaims(callback: (playerName: string, claimName: string, claimData: {}) => void) {

    for (var playerName of Object.keys(database)) {
        var claims = database[playerName]["claims"]

        for (var claimName of Object.keys(claims)) {

            callback(playerName, claimName, claims[claimName]);
        }
    }
}

/**
 * Gets the player closest to the specified block
 * 
 * @param blockLocation - Point to test from
 * 
 * @return - The player closest to the specified point
 */
function getClosestPlayer(blockLocation: Vector3): Player {
    var closestPlayer: Player = undefined;

    // find player closest to the specified block
    for (var p of world.getAllPlayers()) {
        if ((p.dimension == world.getDimension("overworld"))
            && ((closestPlayer == undefined)
                || (Math.cbrt(Math.pow(p.location.x, 3) + Math.pow(p.location.y, 3) + Math.pow(p.location.z, 3)) < (Math.cbrt(Math.pow(closestPlayer.location.x, 3) + Math.pow(closestPlayer.location.y, 3) + Math.pow(closestPlayer.location.z, 3)))))) {
            closestPlayer = p;
        }
    }

    return (closestPlayer);
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

    static main(owner: Player) {
        var claims: {} = database[owner.name]["claims"];

        const form = new ActionFormData()
            .title("ui.main:title")
            .button("ui.main.button:manage", "textures/ui/icon_setting.png")
            .button("ui.main.button:close")

        form.show(owner).then((response) => {
            if (response.selection == 0) {
                if (Object.keys(claims).length == 0) {
                    sendNotification(owner, "chat.claim:no_claims");
                    owner.playSound("note.didgeridoo");
                }
                else {
                    this.managePage(owner);
                }
            }
        });
    }

    static newClaim(owner: Player, start: Vector3, end: Vector3) {
        var claims: {} = database[owner.name]["claims"];

        const form = new ModalFormData()
            .title("ui.claim.new:title")
            .textField("ui.claim.config.textbox:name", "ui.claim.config:name_placeholder")
            .dropdown("ui.claim.config.dropdown:icon", Object.keys(claimIcons))
            .toggle("ui.claim.config.toggle:border_particles", true)

        form.show(owner).then((response) => {

            if (!response.canceled) {

                var name = response.formValues[0].toString();
                var iconPath = claimIcons[Object.keys(claimIcons)[response.formValues[1].toString()]];
                var showBorderParticles = response.formValues[2];

                if (name.length == 0) {
                    sendNotification(owner, "chat.claim:name_required")
                    owner.playSound("note.didgeridoo");
                }
                else if (name in claims) {
                    sendNotification(owner, "chat.claim:use_unique_name")
                    owner.playSound("note.didgeridoo");
                }

                else {
                    // generate dict for the new claim
                    claims[name] = Object.assign({}, dbClaimDefault);

                    // save data
                    claims[name]["start"] = start;
                    claims[name]["end"] = end;
                    claims[name]["icon"] = iconPath;
                    claims[name]["particles"] = showBorderParticles;

                    sendNotification(owner, "chat.claim:created")
                    owner.playSound("random.levelup");
                }
            }
            saveDb();

        });
    }

    static resizeClaim(owner: Player, claimName: string, start: Vector3, end: Vector3) {
        var claims: {} = database[owner.name]["claims"];

        const form = new MessageFormData()
            .title("ui.claim.resize:title")
            .body("ui.claim.resize:body")
            .button1("ui.claim.resize.button:cancel")
            .button2("ui.claim.resize.button:resize")

        form.show(owner).then((response) => {
            // if claim resized
            if (response.selection == 1) {
                claims[claimName]["start"] = start;
                claims[claimName]["end"] = end;

                sendNotification(owner, "chat.claim:resized")
                owner.playSound("random.levelup");

                saveDb();
            }
        });
    }

    static managePage(owner: Player) {
        var claims = database[owner.name]["claims"];

        const form = new ActionFormData()
            .title("ui.manage:title")

        for (var c of Object.keys(claims)) {

            var width = Math.abs(claims[c]["start"]["x"] - claims[c]["end"]["x"]);
            var length = Math.abs(claims[c]["start"]["z"] - claims[c]["end"]["z"]);

            form.button(
                {
                    "rawtext": [
                        { "text": `${c}§r\n§c${width}§8x§9${length} ` }
                    ]
                }, claims[c]["icon"]);
        }

        form.button("ui.global.button:back")

        form.show(owner).then((response) => {
            if (response.selection == Object.keys(claims).length) {
                // return to previous menu
                this.main(owner);
            }
            else {
                this.manageClaim(owner, Object.keys(claims)[response.selection].toString());
            }
        });
    }

    static manageClaim(owner: Player, claimName: string) {
        var claims = database[owner.name]["claims"];

        const form = new ActionFormData()
            .title({
                "rawtext": [
                    { "translate": "ui.manage:title" },
                    { "text": `: ${claimName}` }
                ]
            })
            .body({
                "rawtext": [
                    { "text": "\n" },
                    { "translate": "ui.manage.body:claim_start" },
                    { "text": `:  §cX§r=${claims[claimName]["start"]["x"]} §9Z§r=${claims[claimName]["start"]["z"]}\n\n` },
                    { "translate": "ui.manage.body:claim_end" },
                    { "text": `: §cX§r=${claims[claimName]["end"]["x"]} §9Z§r=${claims[claimName]["end"]["z"]}\n ` }
                ]
            })
            .button("ui.manage.button:config", "textures/ui/debug_glyph_color.png")
            .button("ui.manage.button:public_permissions", "textures/ui/icon_multiplayer.png")
            .button("ui.manage.button:player_permissions", "textures/ui/icon_steve.png")
            .button("ui.manage.button:view", "textures/ui/magnifyingGlass.png")
            .button("ui.manage.button:sell", "textures/ui/icon_trash.png")
            .button("ui.global.button:back")

        form.show(owner).then((response) => {
            if (response.selection == 0) {
                this.claimConfig(owner, claimName);
            }
            else if (response.selection == 1) {
                this.managePermissions(owner, claimName);
            }
            else if (response.selection == 2) {
                this.playerPermissionsList(owner, claimName);
            }
            else if (response.selection == 3) {
                this.viewClaim(owner, claimName);
            }
            else if (response.selection == 4) {
                this.sellClaim(owner, claimName);
            }
            else if (response.selection == 5) {
                // return to previous menu
                this.managePage(owner);
            }
        });
    }

    static playerPermissionsList(owner: Player, claimName: string) {
        var claims = database[owner.name]["claims"];
        var players = Object.keys(claims[claimName]["permissions"]["players"])

        const form = new ActionFormData()
            .title({
                "rawtext": [
                    { "translate": "ui.manage.permissions.player.selection:title" },
                    { "text": `: ${claimName}` }
                ]
            })
            .body("ui.manage.permissions.player.selection:body");

        for (var pName of players) {
            form.button(pName, "textures/ui/profile_glyph_color.png");
        }

        form.button("ui.manage.permissions.player.selection:add_player", "textures/ui/realms_slot_check.png");
        form.button("ui.manage.permissions.player.selection:remove_player", "textures/ui/redX1.png");
        form.button("ui.global.button:back");

        form.show(owner).then((response) => {
            if (response.selection == players.length) {
                // open add player menu
                this.playerPermissionsListModify(owner, claimName, true);
            }
            else if (response.selection == players.length + 1) {
                // open remove player menu
                this.playerPermissionsListModify(owner, claimName, false);
            }
            else if (response.selection == players.length + 2) {
                // return to previous menu
                this.manageClaim(owner, claimName);
            }
            else {
                // open player permissions menu
                this.managePermissions(owner, claimName, players[response.selection]);
            }
        });
    }
    /**
     * creates a prompt to specify what player to add or remove from permissions list
     */
    static playerPermissionsListModify(owner: Player, claimName: string, add: boolean) {
        var claims = database[owner.name]["claims"];

        // if adding player, only show players not in list
        if (add) {

            // filter players from list
            var players = Object.keys(database).filter(el => !Object.keys(claims[claimName]["permissions"]["players"]).includes(el));

            // make sure to remove owner from list
            players.splice(players.indexOf(owner.name), 1);
        }
        // if removing player, only show players in list
        else {
            var players = Object.keys(claims[claimName]["permissions"]["players"]);
        }

        const form = new ModalFormData()
            .title(add ? {
                "rawtext": [
                    { "translate": "ui.manage.permissions.player.selection.modify.add:title" }
                ]
            } :
                {
                    "rawtext": [
                        { "translate": "ui.manage.permissions.player.selection.modify.remove:title" }
                    ]
                }
            )
            .dropdown("ui.manage.permissions.player.selection.modify:player_dropdown", players);

        form.show(owner).then((response) => {

            const playerName = players[Number(response.formValues[0])];

            if (add) {
                // set up default permissions for specified player
                claims[claimName]["permissions"]["players"][playerName] = { ...claims[claimName]["permissions"]["public"] };
            }
            else {
                // remove player from list
                delete claims[claimName]["permissions"]["players"][playerName];

                // if a players permissions have been removed notify them
                for (var p of world.getAllPlayers()) {
                    if (p.name == playerName) {
                        p.runCommandAsync(`tellraw @s {"rawtext":[{"translate":"chat.prefix"}, {"text":" ${owner.name} "}, {"translate":"chat.claim:player_permissions_reset_notif"}, {"translate":"claim:name_color"}, {"text":" ${claimName}"}]}`);
                        p.playSound("random.levelup");
                    }
                }
            }


            saveDb();

            // return to previous menu
            this.playerPermissionsList(owner, claimName)

        });

    }

    /**
    *A page for editing a claims permissions.
    *If the player parameter is not specified the form will edit the claims global permissions.
    */
    static managePermissions(owner: Player, claimName: string, playerName?: string) {
        var permissions = playerName ?
            database[owner.name]["claims"][claimName]["permissions"]["players"][playerName]
            : database[owner.name]["claims"][claimName]["permissions"]["public"];

        const form = new ModalFormData()
            .title(playerName ? {
                "rawtext": [
                    { "text": `${playerName}` },
                    { "translate": "ui.manage.permissions.player:title" },
                    { "text": `: ${claimName}` }
                ]
            } :
                {
                    "rawtext": [
                        { "translate": "ui.manage.permissions.public:title" },
                        { "text": `: ${claimName}` }
                    ]
                }
            )
            .toggle("ui.manage.permissions:enter_claim", permissions["enter-claim"])
            .toggle("ui.manage.permissions:break_blocks", permissions["break-blocks"])
            .toggle("ui.manage.permissions:use_items_on_blocks", permissions["use-items-on-blocks"])
            .toggle("ui.manage.permissions:hurt_entities", permissions["hurt-entities"]);

        if (!playerName) {
            form.toggle("ui.manage.permissions:use_tnt", permissions["use-tnt"])
        }

        form.show(owner).then((response) => {

            if (!response.canceled) {

                // save data
                permissions["enter-claim"] = response.formValues[0];
                permissions["break-blocks"] = response.formValues[1];
                permissions["use-items-on-blocks"] = response.formValues[2];
                permissions["hurt-entities"] = response.formValues[3];

                if (!playerName) {
                    permissions["use-tnt"] = response.formValues[4];
                }

                sendNotification(owner, "chat.claim:permissions_updated");
                owner.playSound("random.levelup");

                // if a players permissions have been updated notify them
                for (var p of world.getAllPlayers()) {
                    if (p.name == playerName) {
                        p.runCommandAsync(`tellraw @s {"rawtext":[{"translate":"chat.prefix"}, {"text":" ${owner.name} "}, {"translate":"chat.claim:player_permissions_updated_notif"}, {"translate":"claim:name_color"}, {"text":" ${claimName}"}]}`);
                        p.playSound("random.levelup");
                    }
                }
            }
            saveDb();

        });
    }

    /*
    Uses the camera command to circle around the specified claim.
    */
    static viewClaim(owner: Player, claimName: string) {

        // only run if player is in overworld
        if (owner.dimension == world.getDimension("overworld")) {

            // set flag
            database[owner.name]["viewing-claim"] = true;

            // disable player movement
            owner.runCommandAsync("inputpermission set @s camera disabled");
            owner.runCommandAsync("inputpermission set @s movement disabled");

            // hide hud
            owner.runCommandAsync("hud @s hide");

            // fade parameters
            var transition: CameraFadeOptions = {
                "fadeColor": {
                    "red": 0,
                    "green": 0,
                    "blue": 0
                },
                "fadeTime": {
                    "fadeInTime": 0.5,
                    "fadeOutTime": 1,
                    "holdTime": 5
                }
            }

            // user defined start and end points of the claim
            var start = database[owner.name]["claims"][claimName]["start"];
            var end = database[owner.name]["claims"][claimName]["end"];

            // load the claim
            owner.runCommandAsync(`tickingarea add ${start["x"]} ${start["y"]} ${start["z"]} ${end["x"]} ${end["y"]} ${end["z"]} claimView`);

            // all 4 points of the claim
            var points = [
                [start["x"], start["z"]],
                [start["x"], end["z"]],
                [end["x"], end["z"]],
                [end["x"], start["z"]]
            ];

            // get the center most block of the claim to look at
            var centerBlock: Vector3 = {
                "x": (start["x"] + end["x"]) / 2,
                "y": (start["y"] + end["y"]) / 2,
                "z": (start["z"] + end["z"]) / 2
            }

            // find a reasonable height to position the camera at
            var width = Math.abs(start["x"] - end["x"]);
            var length = Math.abs(start["z"] - end["z"]);
            var height = Math.sqrt((width ** 2) + (length ** 2)) / 2;

            // camera parameters
            var cornerView: CameraSetPosOptions = {
                "facingLocation": centerBlock,
                "location": {
                    "x": points[3][0],
                    "y": centerBlock["y"] + height,
                    "z": points[3][1]
                }
            }

            // called recursively to cycle through all points
            function nextCorner(index) {

                // the very first point should be set without a delay
                if (index == 0) {
                    var delay = 0;
                }
                else {
                    var delay = 60;
                }

                system.runTimeout(() => {
                    cornerView.easeOptions = {
                        "easeTime": 3,
                        "easeType": EasingType.InOutSine
                    };
                    cornerView.location.x = points[index][0];
                    cornerView.location.z = points[index][1];
                    owner.camera.setCamera("minecraft:free", cornerView);

                    // next corner
                    if (index < 3) {
                        nextCorner(index + 1);
                    }
                    // animation is over, return to first person
                    else {
                        system.runTimeout(() => {
                            transition.fadeTime.holdTime = 1;
                            owner.camera.fade(transition);
                            system.runTimeout(() => {
                                owner.camera.clear();

                                // unload the claim
                                owner.runCommandAsync("tickingarea remove claimView");

                                // set flag back to false
                                database[owner.name]["viewing-claim"] = false;

                                // enable player movement again
                                owner.runCommandAsync("inputpermission set @s camera enabled");
                                owner.runCommandAsync("inputpermission set @s movement enabled");

                                // show hud
                                owner.runCommandAsync("hud @s reset");

                            }, 30);
                        }, 60);
                    }
                }, delay);
            };

            // start transition
            owner.camera.fade(transition);
            owner.playSound("beacon.activate");

            // goto the first corner and start the animation
            system.runTimeout(() => {
                // show title to player
                owner.onScreenDisplay.setTitle({ "translate": "ui.manage.view:loading" });

                owner.camera.setCamera("minecraft:free", cornerView);
                system.runTimeout(() => {
                    nextCorner(0);
                }, 100)
            }, 20);
        }
        // player is not in the right dimension
        else {
            owner.playSound("note.didgeridoo");
            sendNotification(owner, "chat.claim:view");
        }
    }

    static sellClaim(owner: Player, claimName: string) {
        var claims: {} = database[owner.name]["claims"];

        const form = new MessageFormData()
            .title(claimName)
            .body("ui.manage.sell:body")
            .button1("ui.manage.sell.button:cancel")
            .button2("ui.manage.sell.button:confirm")

        form.show(owner).then((response) => {
            // if deletion canceled
            if (response.selection == 0) {

                // return to previous page on menu
                this.manageClaim(owner, claimName);
            }
            else if (response.selection == 1) {

                // delete claim
                delete claims[claimName];
                sendNotification(owner, "chat.claim:sold")
                owner.playSound("mob.creeper.say");

                saveDb();
            }
        });
    }

    static claimConfig(owner: Player, claimName: string) {
        var claims: {} = database[owner.name]["claims"];

        const form = new ModalFormData()
            .title({
                "rawtext": [
                    { "translate": "ui.manage.config:title" },
                    { "text": `: ${claimName}` }
                ]
            })
            .textField("ui.claim.config.textbox:name", "ui.claim.config:name_placeholder", claimName)
            .dropdown("ui.claim.config.dropdown:icon", Object.keys(claimIcons), Object.values(claimIcons).indexOf(claims[claimName]["icon"]))
            .toggle("ui.claim.config.toggle:border_particles", claims[claimName]["particles"])

        form.show(owner).then((response) => {

            if (!response.canceled) {

                var name = response.formValues[0].toString();
                var iconPath = claimIcons[Object.keys(claimIcons)[response.formValues[1].toString()]];
                var showBorderParticles = response.formValues[2];

                if (name.length == 0) {
                    sendNotification(owner, "chat.claim:name_required")
                    owner.playSound("note.didgeridoo");
                }
                else {

                    if (claimName != name) {
                        // copy the claim over to the new name key
                        claims[name] = Object.assign({}, claims[claimName]);

                        // delete the old name key
                        delete claims[claimName];
                    }

                    claims[name]["icon"] = iconPath;
                    claims[name]["particles"] = showBorderParticles;

                    sendNotification(owner, "chat.claim:updated")
                    owner.playSound("note.cow_bell");
                }
            }
            saveDb();

        });
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

    // set flag to false since all camera positions will be reset upon rejoining
    database[data.player.name]["viewing-claim"] = false;
});

// open menu when claim shovel is used
world.afterEvents.itemUse.subscribe((data) => {
    if (data.itemStack.typeId == shovelID) {
        Ui.main(data.source);
    };
});

// disallow players from using items when viewing a claim
world.beforeEvents.itemUse.subscribe((data) => {
    if (database[data.source.name]["viewing-claim"]) {
        data.cancel = true;
    }
});

world.beforeEvents.itemUseOn.subscribe((data) => {
    const faces = {
        "North": data.block.north(1),
        "East": data.block.east(1),
        "South": data.block.south(1),
        "West": data.block.west(1),
        "Up": data.block.above(1),
        "Down": data.block.below(1)
    };
    const placedBlock = faces[data.blockFace];

    // disable input when viewing a claim
    if (database[data.source.name]["viewing-claim"]) {
        data.cancel = true;
    }

    if (data.block.dimension == world.getDimension("overworld")) {
        runInClaims((playerName, claimName, claim) => {
            // check if a block is broken by a player without permissions within the claim
            if ((doOverlap(claim["start"], claim["end"], data.block, data.block) || doOverlap(claim["start"], claim["end"], placedBlock, placedBlock)) && (playerName != data.source.name) && !hasPermission(claim, "use-items-on-blocks", data.source)) {
                data.cancel = true;

                system.run(() => {
                    sendNotification(data.source, "chat.claim.permission:use_item_on_block");
                    data.source.playSound("note.didgeridoo");
                })
            }
        });
    }
});

// Set/adjust claim points if player is sneaking
world.beforeEvents.playerBreakBlock.subscribe((data) => {
    // handle creating claims by setting first and second point
    if ((data.itemStack != undefined) && (data.itemStack.typeId == shovelID)) {
        // stop the shovel from breaking the block
        data.cancel = true

        if (data.dimension == world.getDimension("overworld")) {

            // only allow if cooldown is over
            if (data.player.getItemCooldown("land_shovel_use") == 0) {

                // start shovel cooldown of 1 sec
                system.run(() => {
                    data.player.startItemCooldown("land_shovel_use", 20);
                });

                var firstPoint = database[data.player.name]["first-point"];
                var isResize = false;

                if (!data.player.isSneaking) {
                    firstPoint["resizing-claim"] = "";
                    firstPoint["x"] = data.block.x;
                    firstPoint["y"] = data.block.y;
                    firstPoint["z"] = data.block.z;

                    runInClaims((playerName, claimName, claimData) => {

                        // user defined start and end points of the claim
                        var start = claimData["start"];
                        var end = claimData["end"];

                        // all 4 points of the claim
                        var points = [
                            [[start["x"], start["z"]], [start["x"], end["z"]]],
                            [[end["x"], start["z"]], [end["x"], end["z"]]]
                        ]

                        var brokenPoint = [data.block.x, data.block.z];

                        var aIndex = null;
                        var bIndex = null;

                        // find the index of the broken block
                        for (var a = 0; a < points.length; a++) {
                            for (var b = 0; b < points[a].length; b++) {
                                if (JSON.stringify(points[a][b]) == JSON.stringify(brokenPoint)) {
                                    aIndex = a;
                                    bIndex = b;
                                }
                            }
                        }

                        // if broken block is on a claim corner
                        if (aIndex != null) {
                            isResize = true;
                            if (playerName == data.player.name) {
                                firstPoint["opposite-corner"] = { "x": points[aIndex ^ 1][bIndex ^ 1][0], "y": data.block.y, "z": points[aIndex ^ 1][bIndex ^ 1][1] }
                                firstPoint["resizing-claim"] = claimName;

                                data.player.sendMessage({
                                    "rawtext": [
                                        { "translate": "chat.prefix" },
                                        { "text": " " },
                                        { "translate": "chat.point.resize:selected" },
                                        { "text": `: [§c${data.block.x}§r, §a${data.block.y}§r, §9${data.block.z}§r]\n` },
                                        { "translate": "chat.point.resize:hint" }
                                    ]
                                });

                                system.run(() => {
                                    data.player.playSound("note.banjo")
                                });

                            }
                            else {
                                sendNotification(data.player, "chat.point.resize:disallowed");
                                system.run(() => {
                                    data.player.playSound("note.didgeridoo")
                                });
                            }
                        }
                    });

                    if (!isResize) {
                        data.player.sendMessage({
                            "rawtext": [
                                { "translate": "chat.prefix" },
                                { "text": " " },
                                { "translate": "chat.point.new:selected" },
                                { "text": `: [§c${data.block.x}§r, §a${data.block.y}§r, §9${data.block.z}§r]\n` },
                                { "translate": "chat.point.new:hint" }
                            ]
                        });

                        system.run(() => {
                            data.player.playSound("note.cow_bell")
                        });
                    }
                }
                // if player is crouching
                else {
                    var secondPoint = { "x": data.block.x, "y": data.block.y, "z": data.block.z };
                    var intersectingClaim = false;

                    // if claim is resized
                    if (firstPoint["resizing-claim"].length > 0) {
                        // make sure new claim isn't intersecting others not counting itself
                        runInClaims((playerName, claimName, claim) => {
                            if (doOverlap(claim["start"], claim["end"], firstPoint, secondPoint) && ((playerName != data.player.name) || (claimName != firstPoint["resizing-claim"]))) {
                                intersectingClaim = true;
                            }
                        });

                        if (intersectingClaim) {
                            sendNotification(data.player, "chat.claim:intersecting")

                            system.run(() => {
                                data.player.playSound("note.didgeridoo")
                            });
                        }
                        else {
                            system.run(() => {
                                data.player.playSound("note.cow_bell");

                                Ui.resizeClaim(data.player, firstPoint["resizing-claim"], firstPoint["opposite-corner"], secondPoint);
                            });
                        }
                    }
                    else {

                        // make sure new claim isn't intersecting others
                        runInClaims((playerName, claimName, claim) => {
                            if (doOverlap(claim["start"], claim["end"], firstPoint, secondPoint)) {
                                intersectingClaim = true;
                            }
                        });

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
        if (database[data.player.name]["viewing-claim"]) {
            data.cancel = true;
        }
        //                                                              *added for compatibility with gravestone addon*
        else if (data.dimension == world.getDimension("overworld") && !(data.block.typeId == "darkosto_gravestone:gravestone")) {
            runInClaims((playerName, claimName, claim) => {
                // check if a block is broken by a player without permissions within the claim
                if (doOverlap(claim["start"], claim["end"], data.block, data.block) && (playerName != data.player.name) && !hasPermission(claim, "break-blocks", data.player)) {
                    data.cancel = true;

                    system.run(() => {
                        sendNotification(data.player, "chat.claim.permission:break_blocks");
                        data.player.playSound("note.didgeridoo");
                    })
                }
            });
        }
    }
});

world.beforeEvents.explosion.subscribe((data) => {

    if (data.dimension == world.getDimension("overworld")) {

        var impactedBlocks = data.getImpactedBlocks();

        // find player closest to the explosion, we'll assume this is the player that placed the tnt
        var closestPlayer: Player = getClosestPlayer(data.source.location);

        // flag to send notification
        var sendDisallowedNotification = false;

        // check if tnt blast effects a claim
        runInClaims((playerName, claimName, claim) => {

            // if entity is a mob or player doesn't have permissions
            if ((data.source.typeId != "minecraft:tnt") || !hasPermission(claim, "use-tnt")) {
                // remove all impacted blocks that lie within a claim
                for (var i = 0; i < impactedBlocks.length; i++) {
                    var block = impactedBlocks[i]

                    if (doOverlap(claim["start"], claim["end"], block, block)) {
                        // remove the block
                        impactedBlocks.splice(impactedBlocks.indexOf(block), 1);

                        // set notification flag
                        sendDisallowedNotification = true;

                        // account for deletion
                        i--;
                    }
                }
            }
        });

        // update impacted blocks
        data.setImpactedBlocks(impactedBlocks);

        // if tnt effected a claim notify player
        if ((data.source.typeId == "minecraft:tnt") && sendDisallowedNotification) {
            system.run(() => {
                sendNotification(closestPlayer, "chat.claim.permission:use_tnt");
                closestPlayer.playSound("note.didgeridoo");
            });
        }

    }
});

// stop pistons from interacting with claims on the outside
world.afterEvents.pistonActivate.subscribe((data) => {

    if (data.dimension == world.getDimension("overworld") && (data.piston.getAttachedBlocks().length > 0)) {

        var b = data.piston.getAttachedBlocks()[0]
        if (data.isExpanding) {
            var directionOffset = {
                "x": Math.max(Math.min(b.x - data.block.x, 1), -1),
                "y": Math.max(Math.min(b.y - data.block.y, 1), -1),
                "z": Math.max(Math.min(b.z - data.block.z, 1), -1)
            };
        }
        else {
            var directionOffset = {
                "x": Math.max(Math.min(data.block.x - b.x, 1), -1),
                "y": Math.max(Math.min(data.block.y - b.y, 1), -1),
                "z": Math.max(Math.min(data.block.z - b.z, 1), -1)
            };
        }

        // flag to determine if piston use is allowed
        var allowed = true;

        // check if any of the blocks are in a claim
        for (var block of data.piston.getAttachedBlocks()) {

            if (data.isExpanding) {
                var b = block.offset(directionOffset);
            }

            runInClaims((playerName, claimName, claim) => {

                // if block is in claim but not piston
                if (doOverlap(claim["start"], claim["end"], b.location, b.location) && !doOverlap(claim["start"], claim["end"], data.piston.block.location, data.piston.block.location)) {
                    allowed = false;
                }
            });
        }

        // if attached block is in a claim but pistion is not, disallow the action
        if (!allowed) {
            for (var block of data.piston.getAttachedBlocks().reverse()) {
                data.dimension.runCommand(`clone ${block.x + directionOffset.x} ${block.y + directionOffset.y} ${block.z + directionOffset.z} ${block.x + directionOffset.x} ${block.y + directionOffset.y} ${block.z + directionOffset.z} ${block.x} ${block.y} ${block.z} replace move`)
            }

            // remove the offending piston
            data.dimension.runCommand(`setblock ${data.piston.block.location.x} ${data.piston.block.location.y} ${data.piston.block.location.z} air`)

            // drop the piston item
            var pistonDrop = new ItemStack(data.piston.typeId)
            data.dimension.spawnItem(pistonDrop, data.block.location);

            // get closest player to piston, we will assume they activated it
            var closestPlayer: Player = getClosestPlayer(data.piston.block.location)

            // notify player
            system.run(() => {
                sendNotification(closestPlayer, "chat.claim:piston");
                closestPlayer.playSound("note.didgeridoo");
            });
        }
    }

})

world.beforeEvents.itemUse.subscribe((data) => {

    // disallowed items that could cause harm to an entity
    var disallowedItems = ["minecraft:splash_potion", "minecraft:lingering_potion", "minecraft:bow", "minecraft:crossbow"]

    if (disallowedItems.includes(data.itemStack.typeId) && (data.source.dimension == world.getDimension("overworld"))) {
        runInClaims((playerName, claimName, claim) => {

            // if player has used the disallowed item in a claim
            if (doOverlap(claim["start"], claim["end"], data.source.location, data.source.location) && (playerName != data.source.name) && !hasPermission(claim, "hurt-entities", data.source)) {

                // cancel the action
                data.cancel = true;

                // notify player they don't have permissions
                system.run(() => {
                    sendNotification(data.source, "chat.claim.permission:hurt_entities");
                    data.source.playSound("note.didgeridoo");
                })
            }
        });
    }
})

// player management in claims, runs every 1/20th of a second
system.runInterval(() => {

    // make sure fire charges can't fly into claims
    // also make sure withers can't fly into claim
    for (var e of world.getDimension("overworld").getEntities()) {
        runInClaims((playerName, claimName, claim) => {
            if (doOverlap(claim["start"], claim["end"], e.location, e.location)) {
                if (e.typeId == "minecraft:small_fireball" || e.typeId == "minecraft:wither" || e.typeId == "minecraft:wind_charge_projectile") {
                    e.remove();
                }
            }
        });
    }

    for (var p of world.getAllPlayers()) {

        // only run if player is in overworld
        if (p.dimension == world.getDimension("overworld")) {

            // capture the state of player attribute "in-claim" before it is updated
            var inClaimOld: boolean = database[p.name]["in-claim"];

            // set flag to false before for loop updates it
            database[p.name]["in-claim"] = false;

            runInClaims((playerName, claimName, claim) => {

                // if player is in the claim
                if (doOverlap(claim["start"], claim["end"], p.location, p.location)) {

                    database[p.name]["in-claim"] = true

                    // make sure player can't hurt entities if they don't have permission
                    if ((playerName != p.name) && !hasPermission(claim, "hurt-entities", p)) {
                        p.addEffect("weakness", 40, { "amplifier": 255, "showParticles": false });
                    }

                    if (!database[p.name]["viewing-claim"]) {
                        // show claim name and owner onscreen
                        p.onScreenDisplay.setActionBar(
                            {
                                "rawtext": [
                                    { "translate": "claim:name_color" },
                                    { "text": `${claimName}§r - ${playerName}` },
                                ]
                            });
                    }

                    // if player is not allowed in claim, apply knockback to remove them
                    if (!hasPermission(claim, "enter-claim")) {
                        const velocity = p.getVelocity();
                        p.applyKnockback(-velocity.x, -velocity.z, 3, 0.5);

                        sendNotification(p, "chat.claim.permission:enter_claim");
                        p.playSound("note.didgeridoo");
                    }
                }
            });



            // player has entered claim
            if (!inClaimOld && database[p.name]["in-claim"]) {
                p.playSound("random.door_open")
            }
            // player has exited the claim
            else if (inClaimOld && !database[p.name]["in-claim"]) {
                p.playSound("random.door_close")
            }
        }
        // player is not in overworld
        else {
            database[p.name]["in-claim"] = false;
        }
    }
}, 1);

// renders claim particles every 1 second
system.runInterval(() => {

    var dimension = world.getDimension("overworld");

    runInClaims((playerName, claimName, claim) => {

        // user defined start and end points of the claim
        var start = claim["start"];
        var end = claim["end"];

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
        if (claim["particles"]) {
            // loop through all claim points to determine particle type
            for (var a = 0; a < points.length; a++) {
                for (var b = 0; b < points[a].length; b++) {

                    // only render if claim point is in render distance
                    if (dimension.getBlock({ "x": points[a][b][0], "y": averageY, "z": points[a][b][1] }) != undefined) {

                        // creates sets of verticle claim particles 20 blocks below and above the claim
                        for (var i = averageY - averageOffset; i <= averageY + averageOffset; i += segmentHeight) {
                            if (points[a][b][0] > points[a ^ 1][b][0]) {
                                var xParticleType = "lca:negx_claim_dust";
                            }
                            else {
                                var xParticleType = "lca:posx_claim_dust";
                            }

                            if (points[a][b][1] > points[a][b ^ 1][1]) {
                                var yParticleType = "lca:negz_claim_dust";
                            }
                            else {
                                var yParticleType = "lca:posz_claim_dust";
                            }

                            var particlePoint: Vector3 = { "x": points[a][b][0] + 0.5, "y": i + 0.5, "z": points[a][b][1] + 0.5 };

                            try {
                                dimension.spawnParticle(xParticleType, particlePoint);
                                dimension.spawnParticle(yParticleType, particlePoint);
                                dimension.spawnParticle("lca:rising_claim_dust", particlePoint);
                                dimension.spawnParticle("lca:falling_claim_dust", particlePoint);
                            }
                            catch {
                                // do nothing
                            }

                        }
                    }
                }
            }
        }
    });
}, 20);

