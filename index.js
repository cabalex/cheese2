let addBtns = Array.from(document.getElementsByClassName("add"));

const url = "https://discord.com/api/oauth2/authorize?client_id=881411982908088341&permissions=284041800785&scope=bot%20applications.commands"

document.getElementById('fallback').href = url;

addBtns.map(e => e.addEventListener("click", function() {
    window.open(url, "Window", "toolbar=no,location=no,directories=yes,status=yes,menubar=yes,scrollbars=yes,resizable=yes,width=400,height=500,top="+(screen.height-500)+",left="+(screen.width/2-225));
    document.getElementById('afterAdd').style.display = "block";
}))

function hideModal() {
    document.getElementById('afterAdd').style.display = "none";
}