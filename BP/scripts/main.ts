import { world, system, Player } from '@minecraft/server';
import { ActionFormData, MessageFormData, ModalFormData } from '@minecraft/server-ui';

var shovelID = "lca:claim_shovel"

// check if database property exsists
if (!(world.getDynamicPropertyIds().includes("db"))) {
    world.setDynamicProperty("db", "{}")
}

// load the database property in a dict
var database = JSON.parse(world.getDynamicProperty("db").toString());

function saveDb() {
    world.setDynamicProperty("db", JSON.stringify(database));
}



function sendNotification(player: Player, langEntry: String) {
    player.runCommandAsync(`tellraw @s {"rawtext":[{"translate":"chat.prefix"}, {"text":" "}, {"translate":"${langEntry}"}]}`);
}

class Ui {
    static main(player: Player) {
        const form = new ActionFormData()
            .title("ui.main:title")
            .button("ui.main:manage_claims_button")

        form.show(player).then((response) => {
            if (response.selection === 0) {
                this.manage(player);
            };
        });
    }

    static newClaim(player: Player, start: [x: number, y: number, z: number], end: [x: number, y: number, z: number]) {
        var claims: {} = database[player.name]["claims"];

        const form = new ModalFormData()
            .title("ui.claim.new:title")
            // .body("Crazy, I was crazy once. They locked me in a room, a rubber room. A rubber room with rats, and rats make me crazy.")
            .textField("ui.claim:name", "ui.claim:name_placeholder")
            .toggle("ui.claim:public_toggle", true)

        form.show(player).then((response) => {

            if (!response.canceled) {

                var name = response.formValues[0].toString();
                var hasPublicAccess = response.formValues[1];

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
                    claims[name] = {
                        "start": start,
                        "end": end,

                        "public": {
                            "access": hasPublicAccess,
                            "permisions": {
                                "break-blocks": false,
                                "place-blocks": false
                            }
                        },
                        "whitelist": {}

                    }
                    sendNotification(player, "chat.claim:created")
                    player.playSound("random.levelup");
                }
            }
            saveDb();

        });
    }

    static manage(player: Player) {
        var claims = Object.keys(database[player.name]["claims"]);

        const form = new ActionFormData()
            .title("ui.manage:title")

        for (var c of claims) {
            form.button(c);
        }

        form.button("ui:back_button")

        form.show(player).then((response) => {
            if (response.selection == claims.length) {
                // return to previous menu
                this.main(player);
            }
            else {
                this.manageClaim(player, claims[response.selection].toString());
            }
        });
    }

    static manageClaim(player: Player, claim: string) {
        var claims = Object.keys(database[player.name]["claims"]);

        const form = new ActionFormData()
            .title(claim)
            .button("ui.manage.public_permissions_button")
            .button("ui.manage.whitelist_button")
            .button("ui.manage.rename_button")
            .button("ui.manage.delete_claim_button")
            .button("ui:back_button")

        form.show(player).then((response) => {
            if (response.selection == 0) {

            }
            else if (response.selection == 1) {
                this.publicPermissions(player, claim);
            }
            else if (response.selection == 2) {
                this.renameClaim(player, claim);
            }
            else if (response.selection == 3) {
                this.deleteClaim(player, claim);
            }
            else if (response.selection == 4) {
                // return to previous menu
                this.manage(player);
            }
        });
    }

    static deleteClaim(player: Player, claim: string) {
        var claims: {} = database[player.name]["claims"];

        const form = new MessageFormData()
            .title(claim)
            .body("ui.manage.delete:body")
            .button1("ui.manage.delete:cancel_button")
            .button2("ui.manage.delete:confirm_button")

        form.show(player).then((response) => {
            // if deletion canceled
            if (response.selection == 0) {

                // return to previous page on menu
                this.manageClaim(player, claim);
            }
            else if (response.selection == 1) {

                // delete claim
                delete claims[claim];
                sendNotification(player, "chat.claim:deleted")
                player.playSound("mob.creeper.say");

                saveDb();
            }
        });
    }

    static renameClaim(player: Player, claim: string) {
        var claims: {} = database[player.name]["claims"];

        const form = new ModalFormData()
            .title("Rename Claim")
            // .body("Crazy, I was crazy once. They locked me in a room, a rubber room. A rubber room with rats, and rats make me crazy.")
            .textField("ui.claim:name", "ui.claim:name_placeholder")

        form.show(player).then((response) => {

            if (!response.canceled) {

                var name = response.formValues[0].toString();

                if (name.length == 0) {
                    sendNotification(player, "chat.claim:name_required")
                    player.playSound("note.didgeridoo");
                }
                else if (name in claims) {
                    sendNotification(player, "chat.claim:use_unique_name")
                    player.playSound("note.didgeridoo");
                }

                else {

                    // copy the claim over to the new name key
                    claims[name] = Object.assign({}, claim[claim]);

                    // delete the old name key
                    delete claims[claim];

                    sendNotification(player, "chat.claim:renamed")
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

        database[data.playerName] = {
            "first-point": {
                "is-selected": false,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "claims": {
                /*Ex:
                "home":{

                }
                */
            }
        };
    }

    world.sendMessage(JSON.parse(world.getDynamicProperty("db").toString())[data.playerName]["first-point"]["is-selected"])

    // reset claim shovel selection
    database[data.playerName]["first-point"]["is-selected"] = false;

    // save changes to the database
    saveDb();

});

world.afterEvents.playerSpawn.subscribe((data) => {
    // make sure player has a claim shovel
    data.player.runCommandAsync(`execute if entity @s [hasitem={item=${shovelID}, quantity=0}] run give @s ${shovelID} 1 0 {"keep_on_death": {}, "item_lock":{"mode":"lock_in_inventory"}}`);
});

// open menu when claim shovel is used
world.afterEvents.itemUse.subscribe((data) => {

    if (data.itemStack.typeId == shovelID) {
        Ui.main(data.source);
    };
});

world.beforeEvents.itemUseOn.subscribe((data) => {

    if (data.itemStack.typeId != shovelID) {

        world.sendMessage("your not allowed to place blocks");

        data.cancel = true;
    }

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

// // runs code every 15 ticks
// system.runInterval(() => {
// },
//     15
// );

