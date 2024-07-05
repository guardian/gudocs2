export const style = `
body {
	background: #f1f1f1;
	margin: 0;
	padding: 0;
  }
  
  .container {
	max-width: 1300px;
	background: #fff;
	box-sizing: border-box;
	padding: 12px 20px;
	padding-bottom: 24px;
	margin: 24px auto;
  }
  
  table {
	font-size: 14px;
	border-collapse: collapse;
	width: 100%;
  }
  table thead th {
	font-size: 16px;
	line-height: 20px;
	font-family: "Guardian Egyptian Web", Georgia, serif;
	font-weight: 900;
	font-weight: 600;
  }
  table thead th:first-child {
	text-align: left;
  }
  table td {
	padding: 10px;
  }
  table td:first-child,
  table th:first-child {
	padding-left: 4px;
  }
  table tbody td {
	font-size: 14px;
	line-height: 20px;
	font-family: "Guardian Text Sans Web", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
  }
  table tbody td:first-child {
	font-size: 14px;
	line-height: 20px;
	font-family: "Guardian Text Egyptian Web", Georgia, serif;
  }
  table tbody td:first-child img {
	width: 14px;
	height: 14px;
	display: inline-block;
	margin-bottom: -2px;
	margin-right: 4px;
  }
  table tbody td:nth-child(2), table tbody td:nth-child(3) {
	color: #767676;
  }
  table tbody td:nth-child(4) {
	text-align: center;
	font-size: 12px;
  }
  table tbody td form {
	margin: 0;
  }
  
  .last-updated {
	font-size: 12px;
	font-weight: normal;
	display: inline-block;
	margin-left: 6px;
	color: #333;
  }
  
  .note {
	font-size: 12px;
	margin: 12px 0 18px;
	color: #333;
  }
  
  .note span {
	color: black;
  }
  
  .current, .old, .docs, .table-embed {
	padding: 4px;
	border-radius: 4px;
	color: black;
	text-decoration: none;
	font-size: 12px;
  }
  
  .docs {
	background-color: rgba(0, 0, 180, 0.3);
  }
  
  .table-embed {
	background-color: rgba(211, 129, 34, 0.4);
  }
  
  .current {
	background-color: rgba(0, 136, 0, 0.24);
  }
  
  .old {
	background-color: rgba(136, 0, 0, 0.24);
  }
  
  .current:hover, .old:hover, .docs:hover {
	text-decoration: underline;
  }
  
  tr.domainpermissions--none {
	background: rgb(255, 200, 200);
  }
  
  .permission {
	border-radius: 2px;
	padding: 4px;
  }
  
  .permission--writer {
	background: rgba(0, 136, 0, 0.24);
  }
  
  .permission--reader {
	background: rgba(197, 105, 0, 0.24);
  }
  
  .permission--none, .permission--unknown {
	background: rgba(136, 0, 0, 0.24);
  }
`;